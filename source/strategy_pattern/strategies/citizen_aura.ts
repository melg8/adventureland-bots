import AL, { Character, IPosition, MonsterName, NPCName } from "alclient"
import { Loop, LoopName, Strategy } from "../context.js"
import { AVOID_DOORS_COSTS } from "./move.js"

export type CitizenAuraMoveStrategyOptions = {
    /** The monster type we're farming - used to return to farming position */
    farmMonster: MonsterName | MonsterName[]
    /** The NPC that provides the aura (default: "citizen0") */
    npcName?: NPCName
    /** How long the aura lasts in ms (default: 6000) */
    auraDuration?: number
    /** 
     * Distance to stand from NPC to receive aura (default: 315)
     * Server code: citizen0aura is given when distance < 320 pixels
     */
    auraRange?: number
    /** Idle position for farming (optional - will use monster spawns if not set) */
    idlePosition?: IPosition
    /** If true, will use direct move() instead of smartMove() to reach NPC (ignores walls) */
    directMovement?: boolean
}

/**
 * Strategy to get citizen0aura buff from citizen NPCs.
 * The buff provides +200% drop rate but only lasts 6 seconds.
 * 
 * This strategy will:
 * 1. Check if we have the citizen0aura buff
 * 2. If not, find nearest citizen NPC and move within aura range
 * 3. Once buffed, return to farming position
 * 
 * NOTE: The citizen0aura buff doesn't have an ms field, so we check presence only.
 * The server removes the buff when you leave the aura range.
 */
export class CitizenAuraMoveStrategy implements Strategy<Character> {
    public loops = new Map<LoopName, Loop<Character>>()

    protected options: Required<CitizenAuraMoveStrategyOptions>
    protected farmSpawns: IPosition[] = []

    public constructor(options: CitizenAuraMoveStrategyOptions) {
        this.options = {
            farmMonster: options.farmMonster,
            npcName: options.npcName ?? "citizen0",
            auraDuration: options.auraDuration ?? 6000,
            auraRange: options.auraRange ?? 315,  // Server: distance < 320 gives aura
            idlePosition: options.idlePosition ?? { map: "main", x: 0, y: 0 },
            directMovement: options.directMovement ?? true,
        }

        // Set up farming spawns
        const monsterTypes = Array.isArray(this.options.farmMonster)
            ? this.options.farmMonster
            : [this.options.farmMonster]

        if (options.idlePosition) {
            this.farmSpawns.push({ ...options.idlePosition })
        } else {
            for (const type of monsterTypes) {
                for (const spawn of AL.Pathfinder.locateMonster(type)) {
                    this.farmSpawns.push({ ...spawn })
                }
            }
        }

        this.loops.set("move", {
            fn: async (bot: Character) => {
                await this.move(bot)
            },
            interval: 250,
        })
    }

    public async move(bot: Character) {
        const aura = bot.s.citizen0aura

        // Check if we have the citizen0aura buff
        if (aura) {
            // Have buff - farm monsters immediately
            await this.huntMonsters(bot)
        } else {
            // No buff - go get it
            await this.goToNPC(bot)
        }
    }

    public async goToNPC(bot: Character) {
        const npcName = this.options.npcName
        const npcData = bot.G.npcs[npcName]
        // NPC names in the game are prefixed with $ (e.g., Kane -> $Kane)
        const fixedName = npcData.name?.startsWith('$') ? npcData.name : `$${npcData.name}`

        console.log(`[${bot.name}] Looking for NPC: ${fixedName} (from npcName: ${npcName})`)

        // Look for the NPC in visible players
        const npc = bot.players.get(fixedName)
        if (npc) {
            const distance = AL.Tools.distance(bot, npc)
            console.log(`[${bot.name}] Found NPC ${fixedName} at (${npc.x.toFixed(1)}, ${npc.y.toFixed(1)}), distance: ${distance.toFixed(1)}`)
            console.log(`[${bot.name}] Bot position: (${bot.x.toFixed(1)}, ${bot.y.toFixed(1)})`)
            if (distance > this.options.auraRange) {
                console.log(`[${bot.name}] Moving to NPC, distance: ${distance.toFixed(1)}, auraRange: ${this.options.auraRange}, directMovement: ${this.options.directMovement}`)
                
                if (this.options.directMovement) {
                    // Use direct movement - go to the closest point on the aura boundary
                    // Calculate point that is exactly auraRange pixels from NPC towards bot
                    const angle = Math.atan2(bot.y - npc.y, bot.x - npc.x)
                    const targetPos = {
                        x: npc.x + this.options.auraRange * Math.cos(angle),
                        y: npc.y + this.options.auraRange * Math.sin(angle),
                    }
                    
                    console.log(`[${bot.name}] Moving to aura boundary at (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)})`)
                    
                    await bot.move(targetPos.x, targetPos.y, {
                        resolveOnStart: true,
                    })
                } else {
                    // Use smart movement - avoids walls
                    await bot.smartMove(npc, {
                        getWithin: this.options.auraRange,
                        resolveOnFinalMoveStart: true,
                        useBlink: true,
                        stopIfTrue: async () => {
                            // Stop if we got the aura buff
                            return !!bot.s.citizen0aura
                        },
                    })
                }
            }
            return
        }

        console.log(`[${bot.name}] NPC ${fixedName} not found in visible players`)
        console.log(`[${bot.name}] Visible players:`, [...bot.players.keys()].join(', '))

        // Look for NPC in server data (S object)
        // citizen0 should be listed there if on the same map
        for (const [key, value] of Object.entries(bot.S)) {
            if (value && typeof value === "object" && "name" in value) {
                const npcSData = value as { name: string; x?: number; y?: number; map?: string }
                if (npcSData.name === fixedName && npcSData.x !== undefined && npcSData.y !== undefined) {
                    const npcPos = { map: bot.map, x: npcSData.x, y: npcSData.y }
                    const distance = AL.Tools.distance(bot, npcPos)
                    console.log(`[${bot.name}] Found NPC ${fixedName} in server data at distance ${distance.toFixed(1)}`)
                    
                    if (distance > this.options.auraRange) {
                        if (this.options.directMovement) {
                            // Use direct movement - go to the closest point on the aura boundary
                            // Calculate point that is exactly auraRange pixels from NPC towards bot
                            const angle = Math.atan2(bot.y - npcPos.y, bot.x - npcPos.x)
                            const targetPos = {
                                x: npcPos.x + this.options.auraRange * Math.cos(angle),
                                y: npcPos.y + this.options.auraRange * Math.sin(angle),
                            }
                            
                            console.log(`[${bot.name}] Moving to aura boundary at (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)})`)
                            
                            await bot.move(targetPos.x, targetPos.y, {
                                resolveOnStart: true,
                            })
                        } else {
                            // Use smart movement - avoids walls
                            await bot.smartMove(npcPos, {
                                getWithin: this.options.auraRange,
                                resolveOnFinalMoveStart: true,
                                useBlink: true,
                                stopIfTrue: async () => {
                                    // Stop if we got the aura buff
                                    return !!bot.s.citizen0aura
                                },
                            })
                        }
                    }
                    return
                }
            }
        }

        console.log(`[${bot.name}] NPC ${fixedName} not found in server data either`)

        // NPC not found nearby - return to farm
        // Don't try database - it may not be connected
        await this.returnToFarm(bot)
    }

    public async returnToFarm(bot: Character) {
        if (this.farmSpawns.length === 0) return

        const spawn = this.farmSpawns[0]

        // If we're on a different map, go to spawn
        if (bot.map !== spawn.map) {
            await bot.smartMove(spawn, {
                avoidTownWarps: bot.targets > 0,
                resolveOnFinalMoveStart: true,
                useBlink: true,
            })
            return
        }

        // Check if there are monsters nearby
        const entities = bot.getEntities({
            canDamage: true,
            couldGiveCredit: true,
            typeList: Array.isArray(this.options.farmMonster)
                ? this.options.farmMonster
                : [this.options.farmMonster],
            willBurnToDeath: false,
            willDieToProjectiles: false,
            withinRange: "attack",
        })

        if (entities.length > 0) {
            // Monsters nearby - stay here and let attack strategy handle them
            return
        }

        // No monsters - move to spawn position
        const distance = AL.Tools.distance(bot, spawn)
        if (distance > 50) {
            await bot.smartMove(spawn, {
                costs: AVOID_DOORS_COSTS,
                resolveOnFinalMoveStart: true,
                useBlink: true,
            })
        }
    }

    public async huntMonsters(bot: Character) {
        const monsterTypes = Array.isArray(this.options.farmMonster)
            ? this.options.farmMonster
            : [this.options.farmMonster]

        // Look for monsters to attack
        const entities = bot.getEntities({
            canDamage: true,
            couldGiveCredit: true,
            typeList: monsterTypes,
            willBurnToDeath: false,
            willDieToProjectiles: false,
        })

        if (entities.length > 0) {
            // Sort by distance and move to nearest
            entities.sort((a, b) => {
                const distA = AL.Tools.distance(bot, a)
                const distB = AL.Tools.distance(bot, b)
                return distA - distB
            })

            const target = entities[0]
            const distance = AL.Tools.distance(bot, target)

            // Move to monster if outside attack range
            if (distance > bot.range) {
                await bot.smartMove(target, {
                    costs: AVOID_DOORS_COSTS,
                    getWithin: bot.range,
                    resolveOnFinalMoveStart: true,
                    stopIfTrue: async () => {
                        // Stop moving if we lost the aura buff
                        return !bot.s.citizen0aura
                    },
                })
            }
            return
        }

        // No monsters - return to spawn position
        await this.returnToFarm(bot)
    }
}

/**
 * Wrapper strategy that combines CitizenAuraMoveStrategy with farming logic.
 * Prioritizes getting the aura, but returns to farming when buffed.
 */
export type CitizenAuraEnhancedMoveStrategyOptions = CitizenAuraMoveStrategyOptions & {
    /** If true, will prioritize aura over farming even if it means missing attacks */
    prioritizeAura?: boolean
}

export class CitizenAuraEnhancedMoveStrategy implements Strategy<Character> {
    public loops = new Map<LoopName, Loop<Character>>()

    protected citizenAuraStrategy: CitizenAuraMoveStrategy
    protected options: CitizenAuraEnhancedMoveStrategyOptions

    public constructor(options: CitizenAuraEnhancedMoveStrategyOptions) {
        this.options = {
            ...options,
            prioritizeAura: options.prioritizeAura ?? true,
        }

        this.citizenAuraStrategy = new CitizenAuraMoveStrategy(options)

        this.loops.set("move", {
            fn: async (bot: Character) => {
                await this.move(bot)
            },
            interval: 250,
        })
    }

    public async move(bot: Character) {
        // Delegate to the citizen aura strategy
        // It handles both getting the aura and returning to farm
        await this.citizenAuraStrategy.move(bot)
    }
}
