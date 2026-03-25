import AL, {
    ActionData,
    Character,
    EntitiesData,
    Entity,
    GetEntitiesFilters,
    ItemName,
    LocateItemFilters,
    Mage,
    MonsterName,
    PingCompensatedCharacter,
    SkillName,
    SlotType,
    Tools,
    Warrior,
} from "alclient"
import FastPriorityQueue from "fastpriorityqueue"
import { sleep } from "../../base/general.js"
import { sortPriority } from "../../base/sort.js"
import { Loop, LoopName, Strategist, Strategy, filterContexts } from "../context.js"
import { suppress_errors } from "../logging.js"
import { GenerateEnsureEquipped, generateEnsureEquipped } from "../setups/equipment.js"
import TTLCache from "@isaacs/ttlcache"

export type EnsureEquippedSlot = {
    name: ItemName
    filters?: LocateItemFilters
    unequip?: true
}
export type EnsureEquipped = {
    [T in SlotType]?: EnsureEquippedSlot
}

export type BaseAttackStrategyOptions = GetEntitiesFilters & {
    contexts: Strategist<PingCompensatedCharacter>[]
    disableBasicAttack?: true
    disableCreditCheck?: true
    disableEnergize?: true
    disableIdleAttack?: true
    disableKillSteal?: true
    disableScare?: true
    disableZapper?: true
    /** Disables using zapper to aggro the monster */
    disableZapperGreedyAggro?: true
    /** If set, we will aggro as many nearby monsters as we can */
    enableGreedyAggro?: true | MonsterName[]
    /** If set, we will check if we have the correct items equipped before and after attacking */
    ensureEquipped?: EnsureEquipped
    /** If set, we will generate a loadout */
    generateEnsureEquipped?: GenerateEnsureEquipped
    maximumTargets?: number
    /** Enable deterministic target distribution to prevent overkill when multiple bots farm same spot */
    enableTargetDistribution?: boolean
    /** Lock timeout in ms for target distribution (default: 3000ms) */
    targetLockTimeout?: number
    /** HP threshold for finishing off locked targets (default: 0.25 = 25%) */
    finishOffHPThreshold?: number
    /** Enable time-based attack distribution so bots don't all attack at once (default: false) */
    enableTimeDistribution?: boolean
}

export const KILL_STEAL_AVOID_MONSTERS: MonsterName[] = [
    "kitty1",
    "kitty2",
    "kitty3",
    "kitty4",
    "puppy1",
    "puppy2",
    "puppy3",
    "puppy4",
]
export const IDLE_ATTACK_MONSTERS: MonsterName[] = [
    "arcticbee",
    "armadillo",
    "bat",
    "bee",
    "boar",
    "crab",
    "crabx",
    "croc",
    "cutebee",
    "frog",
    "goo",
    "hen",
    "iceroamer",
    "minimush",
    "nerfedbat",
    "osnake",
    "phoenix",
    "poisio",
    "rat",
    "rooster",
    "scorpion",
    "slenderman",
    "snake",
    "snowman",
    "spider",
    "squig",
    "squigtoad",
    "tortoise",
    "wabbit",
]

export const AGGROED_MONSTERS = new TTLCache<string, true>({
    max: 500,
    ttl: 2000,
})

/** Target lock information for distributed targeting */
interface TargetLock {
    lockedBy: string
    lockedAt: number
}

/** Debug logging counter to avoid spam */
let debugLogCounter = 0

/**
 * Deterministic target distributor using hash-based assignment
 * Ensures multiple bots on the same spot don't all target the same monster
 */
class TargetDistributor {
    private botIds: string[]
    private locks = new Map<string, TargetLock>()
    private lockTimeout: number
    private finishOffHPThreshold: number
    private lastDebugLog = 0

    constructor(botIds: string[], lockTimeout: number = 3000, finishOffHPThreshold: number = 0.25) {
        // Sort bot IDs for deterministic ordering
        this.botIds = [...botIds].sort()
        this.lockTimeout = lockTimeout
        this.finishOffHPThreshold = finishOffHPThreshold
    }

    /**
     * Simple hash function for deterministic distribution
     * Same input always produces same output across all bots
     */
    private simpleHash(str: string): number {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32bit integer
        }
        return Math.abs(hash)
    }

    /**
     * Check if a target is locked (and should not be targeted by other bots)
     */
    isLocked(entityId: string, currentBotId: string): boolean {
        const lock = this.locks.get(entityId)
        if (!lock) return false

        // Own lock is always valid
        if (lock.lockedBy === currentBotId) return true

        // Check if lock has expired
        if (Date.now() - lock.lockedAt > this.lockTimeout) {
            this.locks.delete(entityId)
            return false
        }

        return true
    }

    /**
     * Try to lock a target for this bot
     * Returns true if lock was acquired
     */
    tryLock(entityId: string, botId: string): boolean {
        const existing = this.locks.get(entityId)

        // Already locked by us
        if (existing?.lockedBy === botId) return true

        // Locked by someone else and not expired
        if (existing && Date.now() - existing.lockedAt <= this.lockTimeout) {
            return false
        }

        // Acquire lock
        this.locks.set(entityId, {
            lockedBy: botId,
            lockedAt: Date.now(),
        })
        return true
    }

    /**
     * Release a lock (called after target is killed)
     */
    release(entityId: string): void {
        this.locks.delete(entityId)
    }

    /**
     * Check if we should finish off a target locked by another bot
     */
    shouldFinishOff(botId: string, entity: Entity): boolean {
        const lock = this.locks.get(entity.id)
        if (!lock) return false
        if (lock.lockedBy === botId) return true // Our own lock

        const hpPercent = entity.hp / entity.max_hp
        const lockExpired = Date.now() - lock.lockedAt > this.lockTimeout

        // Finish off if HP is low or lock has expired
        return hpPercent < this.finishOffHPThreshold || lockExpired
    }

    /**
     * Determine if this bot should target this entity based on hash distribution
     */
    shouldTargetEntity(botId: string, entityId: string): boolean {
        const hash = this.simpleHash(botId + entityId)
        const assignedBotIndex = hash % this.botIds.length
        const myIndex = this.botIds.indexOf(botId)
        return assignedBotIndex === myIndex
    }

    /**
     * Select the best target for this bot from available entities
     * Returns null only if there are no entities at all
     * 
     * Behavior: 
     * 1. Try to get an unlocked target assigned by hash
     * 2. If assigned target is locked by someone, help attack it anyway
     * 3. If no hash assignment, pick lowest HP target to help with
     */
    selectTarget(botId: string, entities: Entity[], canKillInOneShot: (e: Entity) => boolean): Entity | null {
        if (entities.length === 0) return null

        // Sort entities by ID for deterministic ordering
        const sortedEntities = [...entities].sort((a, b) => a.id.localeCompare(b.id))

        // Debug log entity list and hash assignments (throttled to once per 5 seconds)
        const now = Date.now()
        if (now - this.lastDebugLog > 5000) {
            this.lastDebugLog = now
            console.log(`[TargetDistributor] ${botId}: ${entities.length} entities, bots: [${this.botIds.join(', ')}]`)
            for (const entity of sortedEntities.slice(0, 3)) { // Show only first 3
                const hash = this.simpleHash(botId + entity.id)
                const assignedBot = this.botIds[hash % this.botIds.length]
                console.log(`  ${entity.id} (${entity.type}) → ${assignedBot}`)
            }
        }

        // Priority 1: Can kill in one shot and not locked by someone else
        for (const entity of sortedEntities) {
            if (canKillInOneShot(entity)) {
                const isLocked = this.isLocked(entity.id, botId)

                if (!isLocked) {
                    // Not locked - claim it
                    if (this.tryLock(entity.id, botId)) {
                        return entity
                    }
                } else {
                    // Locked by us - attack it
                    return entity
                }
            }
        }

        // Priority 2: Find target assigned to this bot by hash
        for (const entity of sortedEntities) {
            if (this.shouldTargetEntity(botId, entity.id)) {
                // Lock if not locked, or attack even if locked by someone (helping)
                this.tryLock(entity.id, botId) // Try to lock, but attack even if fails
                return entity
            }
        }

        // Priority 3: No hash assignment - help with lowest HP target
        const sortedByHP = [...sortedEntities].sort((a, b) => a.hp - b.hp)
        return sortedByHP[0] // Just attack the weakest target
    }

    /**
     * Clean up expired locks periodically
     */
    cleanup(): void {
        const now = Date.now()
        for (const [entityId, lock] of this.locks.entries()) {
            if (now - lock.lockedAt > this.lockTimeout) {
                this.locks.delete(entityId)
            }
        }
    }
}

/**
 * Flexible time-based attack distributor
 * Allows faster bots to attack more often while preventing simultaneous volleys
 * 
 * Rules:
 * 1. Each bot has its own attack cooldown based on its attack speed
 * 2. Minimum delay between ANY bot's attacks (prevents volleys)
 * 3. Faster bots can attack more frequently if conditions allow
 */
class TimeDistributor {
    private botIds: string[]
    private botAttackIntervals = new Map<string, number>() // Per-bot attack interval
    private lastAttackTime = new Map<string, number>()
    private lastAnyBotAttackTime: number // Track when ANY bot last attacked
    private minDelayBetweenAttacks: number // Minimum ms between any two bot attacks
    private static readonly BASE_TIME = Date.now()
    private debugLogTime = 0

    constructor(botIds: string[], attackInterval: number, minDelayBetweenAttacks: number = 100) {
        // Sort bot IDs for deterministic ordering
        this.botIds = [...botIds].sort()
        this.minDelayBetweenAttacks = minDelayBetweenAttacks
        // Initialize to current time so first attack check works correctly
        this.lastAnyBotAttackTime = Date.now()
        
        // Use the same interval for all bots initially (will be overridden per-bot if needed)
        for (const botId of this.botIds) {
            this.botAttackIntervals.set(botId, attackInterval)
        }
        
        console.log(`[TimeDistributor] Created: ${botIds.length} bots, avgInterval=${attackInterval}ms, minDelay=${minDelayBetweenAttacks}ms`)
    }

    /**
     * Set individual bot's attack interval (call this if you know bot's actual attack speed)
     */
    setBotAttackInterval(botId: string, interval: number): void {
        this.botAttackIntervals.set(botId, interval)
    }

    /**
     * Check if it's this bot's turn to attack
     * Returns true if the bot can attack now
     * 
     * Rules:
     * 1. Bot's personal cooldown must be ready (based on its attack speed)
     * 2. At least minDelayBetweenAttacks ms must have passed since ANY bot attacked
     * 3. On first attack, bot waits for its turn based on bot index
     */
    canAttack(botId: string): boolean {
        const botIndex = this.botIds.indexOf(botId)
        if (botIndex === -1) return true // Unknown bot, allow attack

        const now = Date.now()
        const lastAttack = this.lastAttackTime.get(botId) ?? 0
        const botInterval = this.botAttackIntervals.get(botId) ?? this.botAttackIntervals.get(this.botIds[0])!

        // Rule 1: Check bot's personal cooldown
        const timeSinceLastAttack = lastAttack > 0 ? now - lastAttack : Infinity
        const personalCooldownReady = timeSinceLastAttack >= botInterval

        // Rule 2: Check minimum delay since any bot attacked (prevents volleys)
        const timeSinceAnyAttack = now - this.lastAnyBotAttackTime
        const minDelayRespected = timeSinceAnyAttack >= this.minDelayBetweenAttacks

        // Rule 3: On first cycle (never attacked), stagger initial attacks by bot index
        // This prevents all bots from attacking simultaneously on first cycle
        const isFirstCycle = lastAttack === 0
        if (isFirstCycle) {
            // Calculate time since first bot was allowed to attack
            // Bot 0 can attack at t=0, Bot 1 at t=minDelay, Bot 2 at t=2*minDelay, etc.
            const timeSinceCreation = now - this.lastAnyBotAttackTime
            const expectedFirstAttackTime = botIndex * this.minDelayBetweenAttacks
            const canFirstAttack = timeSinceCreation >= expectedFirstAttackTime
            
            const canAttack = canFirstAttack && minDelayRespected
            
            // Debug log for first cycle
            if (now - this.debugLogTime > 20000) {
                this.debugLogTime = now
                console.log(`[TimeDistributor] ${botId} (idx=${botIndex}): firstCycle=true, timeSinceCreation=${Math.round(timeSinceCreation)}ms, expected=${expectedFirstAttackTime}ms, minDelay=${Math.round(timeSinceAnyAttack)}ms, canAttack=${canAttack}`)
            }
            
            return canAttack
        }

        // Normal cycle: personal cooldown + minimum delay
        const canAttack = personalCooldownReady && minDelayRespected

        // Debug log (throttled)
        if (now - this.debugLogTime > 20000) {
            this.debugLogTime = now
            const timeUntilPersonal = Math.max(0, botInterval - timeSinceLastAttack)
            const timeUntilMinDelay = Math.max(0, this.minDelayBetweenAttacks - timeSinceAnyAttack)
            console.log(`[TimeDistributor] ${botId}: personal=${Math.round(timeSinceLastAttack)}/${botInterval}ms (${Math.round(timeUntilPersonal)}ms), minDelay=${Math.round(timeSinceAnyAttack)}/${this.minDelayBetweenAttacks}ms (${Math.round(timeUntilMinDelay)}ms), canAttack=${canAttack}`)
        }

        return canAttack
    }

    /**
     * Record that this bot has attacked
     */
    recordAttack(botId: string): void {
        const now = Date.now()
        this.lastAttackTime.set(botId, now)
        this.lastAnyBotAttackTime = now // Always update to current time
        
        const botIndex = this.botIds.indexOf(botId)
        const botInterval = this.botAttackIntervals.get(botId) ?? 0
        console.log(`[TimeDistributor] ${botId} (idx=${botIndex}): ATTACK (interval=${botInterval}ms)`)
    }

    /**
     * Get the time until this bot can attack next
     */
    getTimeUntilNextAttack(botId: string): number {
        const botIndex = this.botIds.indexOf(botId)
        if (botIndex === -1) return 0

        const now = Date.now()
        const lastAttack = this.lastAttackTime.get(botId) ?? 0
        const botInterval = this.botAttackIntervals.get(botId) ?? 0
        
        // Time until personal cooldown
        const personalCooldown = Math.max(0, botInterval - (now - lastAttack))
        
        // Time until minimum delay is satisfied
        const minDelayTime = Math.max(0, this.minDelayBetweenAttacks - (now - this.lastAnyBotAttackTime))
        
        return Math.max(personalCooldown, minDelayTime)
    }
}

export class BaseAttackStrategy<Type extends Character> implements Strategy<Type> {
    public loops = new Map<LoopName, Loop<Type>>()

    protected greedyOnEntities: (data: EntitiesData) => unknown
    protected stealOnAction: (data: ActionData) => unknown

    protected botSort = new Map<string, (a: Entity, b: Entity) => boolean>()
    protected botEnsureEquipped = new Map<string, EnsureEquipped>()
    protected botTargetDistributor = new Map<string, TargetDistributor>()
    protected botTimeDistributor = new Map<string, TimeDistributor>()
    protected sharedTimeDistributor: TimeDistributor | null = null // Single shared instance for all bots

    protected options: BaseAttackStrategyOptions

    protected interval: SkillName[] = ["attack"]
    protected cleanupInterval: NodeJS.Timeout | null = null

    public constructor(options?: BaseAttackStrategyOptions) {
        this.options = options ?? {
            contexts: [],
        }
        if (!this.options.disableCreditCheck && this.options.couldGiveCredit === undefined)
            this.options.couldGiveCredit = true
        if (this.options.willDieToProjectiles === undefined) this.options.willDieToProjectiles = false

        if (!options.disableZapper) this.interval.push("zapperzap")

        if (this.options.type) {
            this.options.typeList = [this.options.type]
            delete this.options.type
        }

        this.loops.set("attack", {
            fn: async (bot: Type) => {
                if (this.shouldScare(bot)) await this.scare(bot)
                await this.attack(bot).catch(suppress_errors)
            },
            interval: this.interval,
        })
    }

    public onApply(bot: Type) {
        if (this.options.generateEnsureEquipped)
            this.options.ensureEquipped = generateEnsureEquipped(bot, this.options.generateEnsureEquipped)
        this.botEnsureEquipped.set(bot.id, this.options.ensureEquipped)

        this.botSort.set(bot.id, sortPriority(bot, this.options.typeList))

        // Initialize target distributor for this bot if enabled
        if (this.options.enableTargetDistribution && !this.botTargetDistributor.has(bot.id)) {
            // Get all current bot IDs from contexts
            const botIds = this.options.contexts.map((c) => c.bot.id).sort()
            const lockTimeout = this.options.targetLockTimeout ?? 3000
            const finishOffHPThreshold = this.options.finishOffHPThreshold ?? 0.25

            // Create distributor for this bot
            this.botTargetDistributor.set(
                bot.id,
                new TargetDistributor(botIds, lockTimeout, finishOffHPThreshold),
            )

            // Start periodic cleanup if not already running
            if (!this.cleanupInterval) {
                this.cleanupInterval = setInterval(() => {
                    for (const distributor of this.botTargetDistributor.values()) {
                        distributor.cleanup()
                    }
                }, 5000)
            }
        }

        // Initialize time distributor for this bot if enabled
        // Create ONE shared instance for all bots (not per-bot)
        if (this.options.enableTimeDistribution && !this.sharedTimeDistributor) {
            // Get all current bot IDs from contexts
            const botIds = this.options.contexts.map((c) => c.bot.id).sort()

            // Calculate attack interval for EACH bot based on its attack speed (frequency)
            // frequency = attacks per second, so interval = 1000 / frequency
            const minDelayBetweenAttacks = 100 // Minimum 100ms between any two bot attacks
            
            // Calculate intervals for all bots
            const attackIntervals = this.options.contexts.map((c) => {
                const attacksPerSecond = c.bot.frequency || 1
                return Math.round(1000 / attacksPerSecond)
            })
            const avgAttackInterval = Math.round(attackIntervals.reduce((a, b) => a + b, 0) / attackIntervals.length)

            // Create ONE shared distributor
            this.sharedTimeDistributor = new TimeDistributor(botIds, avgAttackInterval, minDelayBetweenAttacks)
            
            // Set individual attack intervals for each bot based on their actual attack speed
            for (const context of this.options.contexts) {
                const botId = context.bot.id
                const attacksPerSecond = context.bot.frequency || 1
                const botInterval = Math.round(1000 / attacksPerSecond)
                this.sharedTimeDistributor.setBotAttackInterval(botId, botInterval)
            }

            console.log(`[TimeDistributor] Shared: ${botIds.length} bots, avgInterval=${avgAttackInterval}ms, minDelay=${minDelayBetweenAttacks}ms (intervals: [${attackIntervals.join(', ')}]ms)`)
        }

        // Store reference to shared distributor for this bot
        if (this.options.enableTimeDistribution && this.sharedTimeDistributor) {
            this.botTimeDistributor.set(bot.id, this.sharedTimeDistributor)
        }

        if (!this.options.disableKillSteal && !this.options.disableZapper) {
            this.stealOnAction = (data: ActionData) => {
                if (!bot.canUse("zapperzap")) return
                if (bot.c.town) return // Currently warping to town

                const attacker = bot.players.get(data.attacker)
                if (!attacker) return // Not a player

                const target = bot.entities.get(data.target)
                if (!target) return // Not an entity
                if (target.target) return // Already has a target, can't steal
                if (target.immune) return // Can't damage with zapper
                if (KILL_STEAL_AVOID_MONSTERS.includes(target.type)) return // Want to avoid kill stealing these
                if (AL.Tools.distance(bot, target) > AL.Game.G.skills.zapperzap.range) return // Too far away to zap
                if (!target.willDieToProjectiles(bot, bot.projectiles, bot.players, bot.entities)) return // It won't die to projectiles

                // Zap to try and kill steal the entity
                this.preventOverkill(bot, target)
                return bot.zapperZap(data.target).catch()
            }
            bot.socket.on("action", this.stealOnAction)
        }
        if (this.options.enableGreedyAggro) {
            this.greedyOnEntities = (data: EntitiesData) => {
                if (data.monsters.length == 0) return // No monsters
                if (this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets) return // Don't want any more targets

                if (!this.shouldAttack(bot)) return
                if (!this.options.disableZapper && !this.options.disableZapperGreedyAggro && bot.canUse("zapperzap")) {
                    for (const monster of data.monsters) {
                        if (monster.target) continue // Already has a target
                        if (
                            Array.isArray(this.options.enableGreedyAggro) &&
                            !this.options.enableGreedyAggro.includes(monster.type)
                        )
                            continue
                        if (this.options.typeList && !this.options.typeList.includes(monster.type)) continue
                        if (AL.Tools.distance(bot, monster) > AL.Game.G.skills.zapperzap.range) continue
                        if (AL.Game.G.monsters[monster.type].immune) continue // Can't damage immune monsters with zapperzap
                        if (AGGROED_MONSTERS.has(monster.id)) continue // Recently aggroed
                        AGGROED_MONSTERS.set(monster.id, true)
                        bot.nextSkill.set("zapperzap", new Date(Date.now() + bot.ping * 2))
                        return bot.zapperZap(monster.id).catch()
                    }
                }
                // TODO: Refactor so this can be put in attack_warrior
                if (bot.ctype == "warrior" && bot.canUse("taunt")) {
                    for (const monster of data.monsters) {
                        if (monster.target) continue // Already has a target
                        if (
                            Array.isArray(this.options.enableGreedyAggro) &&
                            !this.options.enableGreedyAggro.includes(monster.type)
                        )
                            continue
                        if (this.options.typeList && !this.options.typeList.includes(monster.type)) continue
                        if (AL.Tools.distance(bot, monster) > AL.Game.G.skills.taunt.range) continue
                        if (AGGROED_MONSTERS.has(monster.id)) continue // Recently aggroed
                        AGGROED_MONSTERS.set(monster.id, true)
                        bot.nextSkill.set("taunt", new Date(Date.now() + bot.ping * 2))
                        return (bot as unknown as Warrior).taunt(monster.id).catch(suppress_errors)
                    }
                }
                // TODO: Refactor so this can be put in attack_mage
                if (bot.ctype == "mage" && bot.canUse("cburst")) {
                    const cbursts: [string, number][] = []
                    for (const monster of data.monsters) {
                        if (monster.target) continue // Already has a target
                        if (
                            Array.isArray(this.options.enableGreedyAggro) &&
                            !this.options.enableGreedyAggro.includes(monster.type)
                        )
                            continue
                        if (this.options.typeList && !this.options.typeList.includes(monster.type)) continue
                        if (AL.Tools.distance(bot, monster) > AL.Game.G.skills.cburst.range) continue
                        if (AGGROED_MONSTERS.has(monster.id)) continue // Recently aggroed
                        cbursts.push([monster.id, 1])
                    }
                    for (const monster of bot.getEntities({
                        hasTarget: false,
                        typeList: this.options.typeList,
                        withinRange: "cburst",
                    })) {
                        if (cbursts.some((cburst) => cburst[0] == monster.id)) continue // Already in our list to cburst
                        if (AGGROED_MONSTERS.has(monster.id)) continue // Recently aggroed
                        cbursts.push([monster.id, 1])
                    }
                    if (cbursts.length) {
                        for (const cburst of cbursts) AGGROED_MONSTERS.set(cburst[0], true)
                        bot.nextSkill.set("cburst", new Date(Date.now() + bot.ping * 2))
                        return (bot as unknown as Mage).cburst(cbursts).catch()
                    }
                }
                if (bot.canUse("attack")) {
                    for (const monster of data.monsters) {
                        if (monster.target) continue // Already has a target
                        if (
                            Array.isArray(this.options.enableGreedyAggro) &&
                            !this.options.enableGreedyAggro.includes(monster.type)
                        )
                            continue
                        if (this.options.typeList && !this.options.typeList.includes(monster.type)) continue
                        if (AL.Tools.distance(bot, monster) > bot.range) continue
                        if (AGGROED_MONSTERS.has(monster.id)) continue // Recently aggroed
                        AGGROED_MONSTERS.set(monster.id, true)
                        bot.nextSkill.set("attack", new Date(Date.now() + bot.ping * 2))
                        return bot.basicAttack(monster.id).catch()
                    }
                }
            }
            bot.socket.on("entities", this.greedyOnEntities)
        }
    }

    public onRemove(bot: Type) {
        if (this.greedyOnEntities) bot.socket.removeListener("entities", this.greedyOnEntities)
        if (this.stealOnAction) bot.socket.removeListener("action", this.stealOnAction)

        // Clean up target distributor
        this.botTargetDistributor.delete(bot.id)

        // Clear cleanup interval if no bots left
        if (this.cleanupInterval && this.botTargetDistributor.size === 0) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
    }

    protected async attack(bot: Type) {
        const priority = this.botSort.get(bot.id)

        if (!this.shouldAttack(bot)) {
            this.defensiveAttack(bot).catch(suppress_errors)
            return
        }

        await this.ensureEquipped(bot).catch(console.error)

        if (!this.options.disableBasicAttack) await this.basicAttack(bot, priority).catch(suppress_errors)
        if (!this.options.disableZapper) await this.zapperAttack(bot, priority).catch(suppress_errors)
        if (!this.options.disableIdleAttack) await this.idleAttack(bot, priority).catch(suppress_errors)

        await this.ensureEquipped(bot).catch(console.error)
    }

    protected async basicAttack(bot: Type, priority: (a: Entity, b: Entity) => boolean): Promise<unknown> {
        if (!bot.canUse("attack")) return // We can't attack

        // Time-based distribution is checked in multiAttack/supershot/etc. before calling basicAttack
        // So we don't need to check it here again

        if (this.options.enableGreedyAggro) {
            // Attack an entity that doesn't have a target if we can
            const entities = bot.getEntities({
                canDamage: "attack",
                hasTarget: false,
                typeList: Array.isArray(this.options.enableGreedyAggro)
                    ? this.options.enableGreedyAggro
                    : this.options.typeList,
                withinRange: "attack",
            })
            if (
                entities.length &&
                !(this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets)
            ) {
                // Prioritize the entities
                const targets = new FastPriorityQueue<Entity>(priority)
                for (const entity of entities) {
                    if (AGGROED_MONSTERS.has(entity.id)) continue // Recently aggroed
                    targets.add(entity)
                }
                const target = targets.peek()

                const canKill = bot.canKillInOneShot(target)
                if (canKill) this.preventOverkill(bot, target)
                if (
                    !canKill ||
                    targets.size > 0 ||
                    bot.mp < bot.max_mp * 0.25 // Energize if we are low on MP
                )
                    this.getEnergizeFromOther(bot).catch(suppress_errors)

                AGGROED_MONSTERS.set(target.id, true)
                return bot.basicAttack(target.id)
            }
        }

        // Find all targets we want to attack
        const entities = bot.getEntities({
            ...this.options,
            canDamage: "attack",
            withinRange: "attack",
        })
        if (entities.length == 0) return // No targets to attack

        // Use target distribution if enabled
        if (this.options.enableTargetDistribution) {
            const distributor = this.botTargetDistributor.get(bot.id)
            if (distributor) {
                const target = distributor.selectTarget(bot.id, entities, (e) => bot.canKillInOneShot(e))
                if (!target) return // No entities at all

                const canKill = bot.canKillInOneShot(target)
                if (canKill) {
                    this.preventOverkill(bot, target)
                    distributor.release(target.id) // Release lock after confirming kill
                }
                if (!canKill || entities.length > 1) {
                    this.getEnergizeFromOther(bot).catch(suppress_errors)
                }

                return bot.basicAttack(target.id)
            }
        }

        // Prioritize the entities (fallback to original behavior)
        const targets = new FastPriorityQueue<Entity>(priority)
        for (const entity of entities) targets.add(entity)

        const targetingMe = bot.calculateTargets()

        while (targets.size) {
            const target = targets.poll()

            if (!target.target) {
                // We're going to be tanking this monster, don't attack if it pushes us over our limit
                if (this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets) continue // We don't want another target
                switch (target.damage_type) {
                    case "magical":
                        if (bot.mcourage <= targetingMe.magical) continue // We can't tank any more magical monsters
                        break
                    case "physical":
                        if (bot.courage <= targetingMe.physical) continue // We can't tank any more physical monsters
                        break
                    case "pure":
                        if (bot.courage <= targetingMe.pure) continue // We can't tank any more pure monsters
                        break
                }
            }

            const canKill = bot.canKillInOneShot(target)
            if (canKill) this.preventOverkill(bot, target)
            if (!canKill || targets.size > 0) this.getEnergizeFromOther(bot).catch(suppress_errors)

            return bot.basicAttack(target.id)
        }
    }

    protected async idleAttack(bot: Type, priority: (a: Entity, b: Entity) => boolean): Promise<unknown> {
        if (!bot.canUse("attack")) return // We can't attack
        if (bot.s.town) return // We're warping to town

        const entities = bot.getEntities({
            canDamage: "attack",
            couldGiveCredit: true,
            typeList: IDLE_ATTACK_MONSTERS,
            willBurnToDeath: false,
            willDieToProjectiles: false,
            withinRange: "attack",
        })
        if (entities.length == 0) return // No targets to attack

        // Use target distribution if enabled
        if (this.options.enableTargetDistribution) {
            const distributor = this.botTargetDistributor.get(bot.id)
            if (distributor) {
                const target = distributor.selectTarget(bot.id, entities, (e) => bot.canKillInOneShot(e))
                if (!target) return // No entities at all

                const canKill = bot.canKillInOneShot(target)
                if (canKill) {
                    this.preventOverkill(bot, target)
                    distributor.release(target.id) // Release lock after confirming kill
                }
                if (!canKill || entities.length > 1) {
                    this.getEnergizeFromOther(bot).catch(suppress_errors)
                }

                return bot.basicAttack(target.id)
            }
        }

        // Prioritize the entities (fallback to original behavior)
        const targets = new FastPriorityQueue<Entity>(priority)
        for (const entity of entities) targets.add(entity)

        const targetingMe = bot.calculateTargets()

        while (targets.size) {
            const target = targets.poll()

            if (!target.target) {
                // We're going to be tanking this monster, don't attack if it pushes us over our limit
                if (this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets) continue // We don't want another target
                switch (target.damage_type) {
                    case "magical":
                        if (bot.mcourage <= targetingMe.magical) continue // We can't tank any more magical monsters
                        break
                    case "physical":
                        if (bot.courage <= targetingMe.physical) continue // We can't tank any more physical monsters
                        break
                    case "pure":
                        if (bot.courage <= targetingMe.pure) continue // We can't tank any more pure monsters
                        break
                }
            }

            const canKill = bot.canKillInOneShot(target)
            if (canKill) this.preventOverkill(bot, target)
            if (!canKill || targets.size > 0) this.getEnergizeFromOther(bot).catch(suppress_errors)

            return bot.basicAttack(target.id)
        }
    }

    protected async ensureEquipped(bot: Type) {
        const ensureEquipped = this.botEnsureEquipped.get(bot.id)
        if (!ensureEquipped) return

        const equipBatch: { num: number; slot: SlotType }[] = []

        for (const sT in ensureEquipped) {
            const slotType = sT as SlotType
            const ensure = ensureEquipped[slotType]

            if (ensure.unequip) {
                // We want no item in this slot
                if (bot.slots[slotType]) await bot.unequip(slotType)
                continue
            }

            if (
                // We don't have anything equipped
                !bot.slots[slotType] ||
                // We don't have the same name equipped
                bot.slots[slotType].name !== ensure.name ||
                // We want the highest level, and we have a higher level item in our inventory
                (ensure.filters?.returnHighestLevel &&
                    bot.hasItem(ensure.name, bot.items, {
                        ...ensure.filters,
                        levelGreaterThan: bot.slots[slotType].level,
                    })) || // We have a higher level one to equip
                // We want the lowest level, and d we have a lower level item in our inventory
                (ensure.filters?.returnLowestLevel &&
                    bot.hasItem(ensure.name, bot.items, {
                        ...ensure.filters,
                        levelLessThan: bot.slots[slotType].level,
                    })) // We have a lower level one to equip
            ) {
                let toEquip = bot.locateItem(ensure.name, bot.items, ensure.filters)
                if (toEquip === undefined) {
                    if (
                        slotType === "mainhand" &&
                        // We have it equipped in our offhand
                        bot.slots["offhand"]?.name === ensure.name &&
                        // We don't want it equipped in our offhand
                        (!ensureEquipped["offhand"] || ensureEquipped["offhand"].name !== ensure.name) &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("offhand")
                    } else if (
                        slotType === "offhand" &&
                        // We have it equipped in our mainhand
                        bot.slots["mainhand"]?.name === ensure.name &&
                        // We don't want it equipped in our mainhand
                        (!ensureEquipped["mainhand"] || ensureEquipped["mainhand"].name !== ensure.name) &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("mainhand")
                    } else if (
                        slotType === "ring1" &&
                        // We have it equipped in the other slot
                        bot.slots["ring2"]?.name === ensure.name &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("ring2")
                    } else if (
                        slotType === "ring2" &&
                        // We have it equipped in the other slot
                        bot.slots["ring1"]?.name === ensure.name &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("ring1")
                    } else if (
                        slotType === "earring1" &&
                        // We have it equipped in the other slot
                        bot.slots["earring2"]?.name === ensure.name &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("earring2")
                    } else if (
                        slotType === "earring2" &&
                        // We have it equipped in the other slot
                        bot.slots["earring1"]?.name === ensure.name &&
                        // We have enough space to unequip something
                        bot.esize > 0
                    ) {
                        toEquip = await bot.unequip("earring1")
                    } else {
                        throw new Error(`${bot.name} couldn't find ${ensure.name} to equip in ${sT}.`)
                    }
                }

                // Doublehand logic
                if (slotType == "mainhand") {
                    // Check if we have to unequip offhand
                    const weaponType = AL.Game.G.items[ensure.name].wtype
                    const doubleHandTypes = AL.Game.G.classes[bot.ctype].doublehand
                    if (weaponType && doubleHandTypes && doubleHandTypes[weaponType]) {
                        if (ensureEquipped.offhand && !ensureEquipped.offhand.unequip)
                            throw new Error(
                                `'${ensure.name}' is a doublehand for ${bot.ctype}. We can't equip ${ensureEquipped.offhand.name} in our offhand.`,
                            )
                        if (bot.slots.offhand) {
                            if (bot.esize <= 0) continue // We don't have enough space to unequip our offhand
                            await bot.unequip("offhand")
                        }
                    }
                } else if (slotType == "offhand" && bot.slots["mainhand"]) {
                    // Check if we have to unequip mainhand
                    const equippedName = bot.slots["mainhand"].name
                    const weaponType = AL.Game.G.items[equippedName].wtype
                    const doubleHandTypes = AL.Game.G.classes[bot.ctype].doublehand
                    if (weaponType && doubleHandTypes && doubleHandTypes[weaponType]) {
                        if (bot.esize <= 0) continue // We don't have enough space to unequip our offhand
                        await bot.unequip("mainhand")
                    }
                }

                equipBatch.push({ num: toEquip, slot: slotType })
            }
        }

        if (equipBatch.length) await bot.equipBatch(equipBatch).catch(console.error)
    }

    protected async scare(bot: Type) {
        if (this.options.disableScare) return
        if (!(bot.hasItem("jacko") || bot.isEquipped("jacko"))) return // No jacko to scare
        if (!bot.isEquipped("jacko") && bot.canUse("scare", { ignoreEquipped: true })) {
            await bot.equip(bot.locateItem("jacko"), "orb")
            if (bot.s.penalty_cd) await sleep(bot.s.penalty_cd.ms)
        }
        if (!bot.canUse("scare")) return // Can't use scare
        return bot.scare()
    }

    /**
     * Extra attack logic if we "shouldn't attack", but we still have a target
     */
    protected async defensiveAttack(bot: Type) {
        if (!bot.canUse("attack")) return // We can't attack

        const entity = bot.getEntity({
            ...this.options,
            canDamage: "attack",
            targetingPartyMember: true,
            withinRange: "attack",
            returnLowestHP: true,
        })
        if (!entity) return // No entity

        return bot.basicAttack(entity.id)
    }

    protected async zapperAttack(bot: Type, priority: (a: Entity, b: Entity) => boolean) {
        if (this.options.disableZapper) return
        if (!bot.canUse("zapperzap")) return // We can't zap

        if (this.options.enableGreedyAggro && !this.options.disableZapperGreedyAggro) {
            const entities = bot.getEntities({
                canDamage: "zapperzap",
                hasTarget: false,
                typeList: Array.isArray(this.options.enableGreedyAggro)
                    ? this.options.enableGreedyAggro
                    : this.options.typeList,
                withinRange: "zapperzap",
            })
            if (
                entities.length &&
                !(this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets)
            ) {
                // Prioritize the entities
                const targets = new FastPriorityQueue<Entity>(priority)
                for (const entity of entities) {
                    if (AGGROED_MONSTERS.has(entity.id)) continue // Recently aggroed
                    targets.add(entity)
                }

                const target = targets.peek()
                AGGROED_MONSTERS.set(target.id, true)
                return bot.zapperZap(target.id)
            }
        }

        // Find all targets we want to attack
        const entities = bot.getEntities({
            ...this.options,
            canDamage: "zapperzap",
            withinRange: "zapperzap",
        })
        if (entities.length == 0) return // No targets to attack

        if (bot.mp < bot.max_mp - 500) {
            // When we're not near full mp, only zap if we can kill the entity in one shot
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i]
                if (!bot.canKillInOneShot(entity, "zapperzap")) {
                    entities.splice(i, 1)
                    i--
                    continue
                }
            }
        }
        if (entities.length == 0) return // No targets to attack

        // Use target distribution if enabled
        if (this.options.enableTargetDistribution) {
            const distributor = this.botTargetDistributor.get(bot.id)
            if (distributor) {
                const target = distributor.selectTarget(bot.id, entities, (e) => bot.canKillInOneShot(e, "zapperzap"))
                if (!target) return // No suitable target for this bot

                const canKill = bot.canKillInOneShot(target, "zapperzap")
                if (canKill) {
                    this.preventOverkill(bot, target)
                    distributor.release(target.id) // Release lock after confirming kill
                }

                return bot.zapperZap(target.id)
            }
        }

        // Prioritize the entities (fallback to original behavior)
        const targets = new FastPriorityQueue<Entity>(priority)
        for (const entity of entities) targets.add(entity)

        const targetingMe = bot.calculateTargets()

        while (targets.size) {
            const target = targets.poll()

            if (!target.target) {
                // We're going to be tanking this monster, don't attack if it pushes us over our limit
                if (this.options.maximumTargets !== undefined && bot.targets >= this.options.maximumTargets) continue // We don't want another target
                switch (target.damage_type) {
                    case "magical":
                        if (bot.mcourage <= targetingMe.magical) continue // We can't tank any more magical monsters
                        break
                    case "physical":
                        if (bot.courage <= targetingMe.physical) continue // We can't tank any more physical monsters
                        break
                    case "pure":
                        if (bot.courage <= targetingMe.pure) continue // We can't tank any more pure monsters
                        break
                }
            }

            const canKill = bot.canKillInOneShot(target)
            if (canKill) this.preventOverkill(bot, target)

            return bot.zapperZap(target.id)
        }
    }

    /**
     * If we have `options.characters` set, we look for a mage that can energize us.
     *
     * @param bot The bot to energize
     */
    protected async getEnergizeFromOther(bot: Character) {
        if (this.options.disableEnergize) return
        if (bot.s.energized) return // We're already energized

        for (const context of filterContexts(this.options.contexts, { serverData: bot.serverData })) {
            const char = context.bot
            if (char == bot) continue // Can't energize ourselves
            if (AL.Tools.distance(bot, char) > bot.G.skills.energize.range) continue // Too far away
            if (!char.canUse("energize")) continue // Friend can't use energize
            if (char.mp < char.max_mp * 0.25) continue // Don't use energize if mage is low on MP

            // Energize!
            return (char as Mage).energize(bot.id, Math.min(char.mp * 0.25, Math.max(1, bot.max_mp - bot.mp)))
        }
    }

    /**
     * Call this function if we are going to kill the target
     *
     * If we have `options.contexts` set, calling this will remove the target from the other
     * contexts so they won't attack it.
     *
     * @param bot The bot that is performing the attack
     * @param target The target we will kill
     */
    protected preventOverkill(bot: Character, target: Entity) {
        for (const context of filterContexts(this.options.contexts, { serverData: bot.serverData })) {
            const friend = context.bot
            if (friend == bot) continue // Don't remove it from ourself
            if (AL.Constants.SPECIAL_MONSTERS.includes(target.type)) continue // Don't delete special monsters
            friend.deleteEntity(target.id)
        }
    }

    /**
     * Check if we should attack with the bot, or if there's a reason we shouldn't.
     *
     * @param bot The bot that is attacking
     */
    protected shouldAttack(bot: Character) {
        if (bot.c.town) return false // Don't attack if teleporting
        if (bot.c.fishing || bot.c.mining) return false // Don't attack if mining or fishing
        if (!this.options.disableScare && bot.isOnCooldown("scare")) return false // Don't attack if scare is on cooldown
        return true
    }

    protected shouldScare(bot: Character) {
        if (bot.targets == 0) return false // Nothing is targeting us
        if (this.options.disableScare) return false // We have scare disabled

        if (this.options.typeList) {
            // If something else is targeting us, scare
            const targetingMe = bot.getEntities({
                notTypeList: [
                    ...this.options.typeList,
                    ...(this.options.disableIdleAttack ? [] : IDLE_ATTACK_MONSTERS),
                ],
                targetingMe: true,
                willDieToProjectiles: false,
            })

            // Scare if they're within attacking range, or almost within attacking range
            if (targetingMe.some((e) => e.range >= Tools.distance(bot, e) * 1.2)) return true
        }

        if (this.options.type) {
            // If something else is targeting us, scare
            const targetingMe = bot.getEntities({
                notTypeList: [this.options.type, ...(this.options.disableIdleAttack ? [] : IDLE_ATTACK_MONSTERS)],
                targetingMe: true,
                willDieToProjectiles: false,
            })

            // Scare if they're within attacking range, or almost within attacking range
            if (targetingMe.some((e) => e.range >= Tools.distance(bot, e) * 1.2)) return true
        }

        // If we have more targets than what our maximum is set to, we probably want to scare
        if (this.options.maximumTargets !== undefined && bot.targets > this.options.maximumTargets) {
            return true
        }

        // If we could die due to attacks from incoming monsters
        let potentialIncomingDamage = 0
        const multiplier = bot.calculateTargets()
        multiplier["magical"] -= bot.mcourage
        multiplier["physical"] -= bot.courage
        multiplier["pure"] -= bot.pcourage
        for (const entity of bot.getEntities({ targetingMe: true })) {
            if (AL.Tools.distance(bot, entity) > entity.range + entity.speed) continue // Too far away to attack us
            let entityDamage = entity.calculateDamageRange(bot)[1]

            // Calculate additional mobbing damage
            if (multiplier[entity.damage_type] > 0) entityDamage *= 1 + 0.2 * multiplier[entity.damage_type]

            potentialIncomingDamage += entityDamage
        }
        if (potentialIncomingDamage >= bot.hp) return true

        // If we have enableGreedyAggro on, we are probably okay with a lot of targets
        if (this.options.enableGreedyAggro) return false

        return bot.isScared() && bot.hp < bot.max_hp / 2
    }
}
