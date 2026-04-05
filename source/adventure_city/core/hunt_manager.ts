import AL, { CharacterType, IPosition, MapName, MonsterName, PingCompensatedCharacter } from "alclient"
import { Strategist, Strategy } from "../../strategy_pattern/context.js"
import { MageAttackStrategy } from "../../strategy_pattern/strategies/attack_mage.js"
import { PaladinAttackStrategy } from "../../strategy_pattern/strategies/attack_paladin.js"
import { PriestAttackStrategy } from "../../strategy_pattern/strategies/attack_priest.js"
import { RangerAttackStrategy } from "../../strategy_pattern/strategies/attack_ranger.js"
import { RogueAttackStrategy } from "../../strategy_pattern/strategies/attack_rogue.js"
import { WarriorAttackStrategy } from "../../strategy_pattern/strategies/attack_warrior.js"
import { ImprovedMoveStrategy } from "../../strategy_pattern/strategies/move.js"
import { BotRegistry, HuntDefinition, HuntGroupRecord, HuntManager, XPRotationConfig } from "../config/types.js"
import { getBotsByHunt } from "./bot_registry.js"

export function buildHuntManager(
    registry: BotRegistry,
    huntDefs: HuntDefinition[],
): HuntManager {
    const hunts = new Map<string, HuntGroupRecord>()
    const botToHunt = new Map<string, string>()

    for (const def of huntDefs) {
        if (!def.enabled) continue

        const bots = getBotsByHunt(registry, def.id)
        const hunterBotIds = bots.map(b => b.botId)

        // Each hunt gets its own mutable contexts array
        // Attack strategies reference this array, so TimeDistributor
        // only sees bots within this specific hunt
        const huntContexts: Strategist<PingCompensatedCharacter>[] = []

        const attackStrategies = createAttackStrategies(def.monster, huntContexts)
        const moveStrategy = createMoveStrategy(def.monster, def.location)

        const record: HuntGroupRecord = {
            id: def.id,
            name: def.name,
            monster: def.monster,
            location: def.location ?? null,
            hunterBotIds,
            xpRotation: def.xpRotation ?? null,
            enabled: def.enabled,
            contexts: huntContexts,
            attackStrategies,
            moveStrategy,
        }

        hunts.set(def.id, record)

        for (const botId of hunterBotIds) {
            botToHunt.set(botId, def.id)
        }

        console.log(`[HUNT] Created hunt: ${def.name} (${def.id}), monster: ${def.monster}, hunters: ${hunterBotIds.length}`)
    }

    return { hunts, botToHunt }
}

function createAttackStrategies(
    monster: MonsterName,
    huntContexts: Strategist<PingCompensatedCharacter>[],
): Map<CharacterType, Strategy<PingCompensatedCharacter>> {
    const strategies = new Map<CharacterType, Strategy<PingCompensatedCharacter>>()

    strategies.set("mage", new MageAttackStrategy({
        contexts: huntContexts,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    strategies.set("paladin", new PaladinAttackStrategy({
        contexts: huntContexts,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    strategies.set("priest", new PriestAttackStrategy({
        contexts: huntContexts,
        disableCurse: true,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    strategies.set("ranger", new RangerAttackStrategy({
        contexts: huntContexts,
        disableHuntersMark: true,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    strategies.set("rogue", new RogueAttackStrategy({
        contexts: huntContexts,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    strategies.set("warrior", new WarriorAttackStrategy({
        contexts: huntContexts,
        disableAgitate: true,
        type: monster,
        enableTargetDistribution: true,
        enableTimeDistribution: true,
    }))

    return strategies
}

function createMoveStrategy(
    monster: MonsterName,
    location?: IPosition,
): Strategy<PingCompensatedCharacter> {
    if (location) {
        return new ImprovedMoveStrategy(monster, {
            idlePosition: location,
        })
    }
    return new ImprovedMoveStrategy(monster)
}

export function getHuntContexts(huntManager: HuntManager, huntId: string): Strategist<PingCompensatedCharacter>[] {
    const hunt = huntManager.hunts.get(huntId)
    return hunt?.contexts ?? []
}

export function getHuntAttackStrategy(
    huntManager: HuntManager,
    huntId: string,
    ctype: CharacterType,
): Strategy<PingCompensatedCharacter> | undefined {
    const hunt = huntManager.hunts.get(huntId)
    return hunt?.attackStrategies.get(ctype)
}

export function getHuntMoveStrategy(
    huntManager: HuntManager,
    huntId: string,
): Strategy<PingCompensatedCharacter> | null {
    const hunt = huntManager.hunts.get(huntId)
    return hunt?.moveStrategy ?? null
}

export function updateHuntContexts(huntManager: HuntManager, registry: BotRegistry, allCombatContexts: Strategist<PingCompensatedCharacter>[]) {
    for (const [huntId, hunt] of huntManager.hunts) {
        hunt.contexts.length = 0
        for (const botId of hunt.hunterBotIds) {
            const bot = registry.bots.get(botId)
            if (bot?.context) {
                hunt.contexts.push(bot.context)
                if (!allCombatContexts.includes(bot.context)) {
                    allCombatContexts.push(bot.context)
                }
            }
        }
    }
}
