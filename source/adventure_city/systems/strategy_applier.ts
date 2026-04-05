import AL, { CharacterType, ItemName, MapName, MonsterName, PingCompensatedCharacter } from "alclient"
import { Strategist, Strategy } from "../../strategy_pattern/context.js"
import { AcceptPartyRequestStrategy, RequestPartyStrategy } from "../../strategy_pattern/strategies/party.js"
import { PartyHealStrategy } from "../../strategy_pattern/strategies/partyheal.js"
import { ChargeStrategy } from "../../strategy_pattern/strategies/charge.js"
import { MagiportOthersSmartMovingToUsStrategy } from "../../strategy_pattern/strategies/magiport.js"
import { GiveRogueSpeedStrategy } from "../../strategy_pattern/strategies/rspeed.js"
import { AvoidStackingStrategy } from "../../strategy_pattern/strategies/avoid_stacking.js"
import { AvoidDeathStrategy } from "../../strategy_pattern/strategies/avoid_death.js"
import { RespawnStrategy } from "../../strategy_pattern/strategies/respawn.js"
import { ElixirStrategy } from "../../strategy_pattern/strategies/elixir.js"
import { ItemStrategy } from "../../strategy_pattern/strategies/item.js"
import { BuyStrategy } from "../../strategy_pattern/strategies/buy.js"
import { SellStrategy } from "../../strategy_pattern/strategies/sell.js"
import { MoveToBankAndDepositStuffStrategy } from "../../strategy_pattern/strategies/bank.js"
import { GetHolidaySpiritStrategy, GetReplenishablesStrategy, ImprovedMoveStrategy } from "../../strategy_pattern/strategies/move.js"
import { ToggleStandStrategy } from "../../strategy_pattern/strategies/stand.js"
import { TrackerStrategy } from "../../strategy_pattern/strategies/tracker.js"
import { DestroyStrategy } from "../../strategy_pattern/strategies/destroy.js"
import { BaseStrategy } from "../../strategy_pattern/strategies/base.js"
import { HuntGroupRecord, HuntManager, MerchantManager, PartyManager, BotRegistry } from "../config/types.js"
import { getHuntAttackStrategy, getHuntMoveStrategy } from "../core/hunt_manager.js"
import { updatePartyContexts, getPartyLeaderName } from "../core/party_manager.js"
import { updateMerchantContexts, getMerchantForParty, getFighterContextsForMerchant } from "../core/merchant_manager.js"
import { ItemConfig } from "../../base/itemsNew.js"

const currentSetups = new Map<Strategist<PingCompensatedCharacter>, Strategy<PingCompensatedCharacter>[]>()

export function swapStrategies(
    context: Strategist<PingCompensatedCharacter>,
    strategies: Strategy<PingCompensatedCharacter>[],
): void {
    for (const strategy of currentSetups.get(context) ?? []) {
        if (strategies.includes(strategy)) continue
        context.removeStrategy(strategy)
    }

    for (const strategy of strategies) {
        if (context.hasStrategy(strategy)) continue
        context.applyStrategy(strategy)
    }

    currentSetups.set(context, strategies)
}

export interface SharedStrategies {
    avoidStacking: AvoidStackingStrategy<PingCompensatedCharacter>
    avoidDeath: AvoidDeathStrategy<PingCompensatedCharacter>
    bank: MoveToBankAndDepositStuffStrategy<PingCompensatedCharacter>
    base: BaseStrategy<PingCompensatedCharacter>
    buy: Map<string, BuyStrategy<PingCompensatedCharacter>>
    charge: ChargeStrategy
    elixir: ElixirStrategy<PingCompensatedCharacter>
    getHolidaySpirit: GetHolidaySpiritStrategy<PingCompensatedCharacter>
    getReplenishables: Map<string, GetReplenishablesStrategy<PingCompensatedCharacter>>
    magiport: Map<string, MagiportOthersSmartMovingToUsStrategy>
    partyAccept: AcceptPartyRequestStrategy<PingCompensatedCharacter>
    partyHeal: Map<string, PartyHealStrategy>
    respawn: RespawnStrategy<PingCompensatedCharacter>
    rspeed: GiveRogueSpeedStrategy
    sell: SellStrategy<PingCompensatedCharacter>
    tracker: TrackerStrategy
    destroy: DestroyStrategy<PingCompensatedCharacter>
}

export function createSharedStrategies(
    huntManager: HuntManager,
    itemConfig: ItemConfig,
    replenishables: Map<ItemName, number>,
): SharedStrategies {
    const allContexts: Strategist<PingCompensatedCharacter>[] = []

    const buyStrategies = new Map<string, BuyStrategy<PingCompensatedCharacter>>()
    const replenishStrategies = new Map<string, GetReplenishablesStrategy<PingCompensatedCharacter>>()
    const magiportStrategies = new Map<string, MagiportOthersSmartMovingToUsStrategy>()
    const partyHealStrategies = new Map<string, PartyHealStrategy>()

    for (const [huntId, hunt] of huntManager.hunts) {
        buyStrategies.set(huntId, new BuyStrategy<PingCompensatedCharacter>({ contexts: hunt.contexts, itemConfig }))
        replenishStrategies.set(huntId, new GetReplenishablesStrategy<PingCompensatedCharacter>({ contexts: hunt.contexts, replenishables }))
        magiportStrategies.set(huntId, new MagiportOthersSmartMovingToUsStrategy(hunt.contexts))
        partyHealStrategies.set(huntId, new PartyHealStrategy(hunt.contexts))
    }

    return {
        avoidStacking: new AvoidStackingStrategy<PingCompensatedCharacter>(),
        avoidDeath: new AvoidDeathStrategy<PingCompensatedCharacter>(),
        bank: new MoveToBankAndDepositStuffStrategy<PingCompensatedCharacter>(),
        base: new BaseStrategy<PingCompensatedCharacter>(allContexts),
        buy: buyStrategies,
        charge: new ChargeStrategy(),
        elixir: new ElixirStrategy<PingCompensatedCharacter>("elixirluck"),
        getHolidaySpirit: new GetHolidaySpiritStrategy<PingCompensatedCharacter>(),
        getReplenishables: replenishStrategies,
        magiport: magiportStrategies,
        partyAccept: new AcceptPartyRequestStrategy<PingCompensatedCharacter>(),
        partyHeal: partyHealStrategies,
        respawn: new RespawnStrategy<PingCompensatedCharacter>(),
        rspeed: new GiveRogueSpeedStrategy(),
        sell: new SellStrategy<PingCompensatedCharacter>({ itemConfig }),
        tracker: new TrackerStrategy(),
        destroy: new DestroyStrategy<PingCompensatedCharacter>({ itemConfig }),
    }
}

export function applySharedStrategies(
    context: Strategist<PingCompensatedCharacter>,
    botName: string,
    partyLeaderName: string | null,
    shared: SharedStrategies,
    huntId: string | null,
): void {
    if (context.bot.ctype === "merchant") return

    context.applyStrategy(shared.avoidStacking)
    context.applyStrategy(shared.avoidDeath)
    context.applyStrategy(shared.respawn)
    context.applyStrategy(shared.elixir)
    context.applyStrategy(shared.tracker)
    context.applyStrategy(shared.destroy)

    if (huntId) {
        const buyStrategy = shared.buy.get(huntId)
        if (buyStrategy) context.applyStrategy(buyStrategy)

        const sellStrategy = shared.sell
        context.applyStrategy(sellStrategy)

        const replenishStrategy = shared.getReplenishables.get(huntId)
        if (replenishStrategy) {
            (context as any)._replenishStrategy = replenishStrategy
        }
    }

    if (partyLeaderName && botName !== partyLeaderName) {
        context.applyStrategy(new RequestPartyStrategy<PingCompensatedCharacter>(partyLeaderName))
    } else if (partyLeaderName && botName === partyLeaderName) {
        context.applyStrategy(shared.partyAccept)
    }

    if (context.bot.ctype === "mage" && huntId) {
        const magiport = shared.magiport.get(huntId)
        if (magiport) context.applyStrategy(magiport)
    }

    if (context.bot.ctype === "priest" && huntId) {
        const partyHeal = shared.partyHeal.get(huntId)
        if (partyHeal) context.applyStrategy(partyHeal)
    }

    if (context.bot.ctype === "rogue") {
        context.applyStrategy(shared.rspeed)
    }

    if (context.bot.ctype === "warrior") {
        context.applyStrategy(shared.charge)
    }
}

export function determineBotState(
    context: Strategist<PingCompensatedCharacter>,
    shared: SharedStrategies,
    replenishables: Map<ItemName, number>,
    huntId: string | null,
): Strategy<PingCompensatedCharacter>[] | null {
    if (!context.isReady() || !context.bot.ready || context.bot.rip) {
        return null
    }

    if (context.bot.ctype === "merchant") {
        return null
    }

    if (context.bot.S.holidayseason && !context.bot.s.holidayspirit) {
        return [shared.getHolidaySpirit]
    }

    if (context.bot.esize <= 0) {
        return [shared.bank]
    }

    const replenishStrategy = huntId ? shared.getReplenishables.get(huntId) : null
    if (replenishStrategy) {
        for (const [item, numHold] of replenishables) {
            const numHas = context.bot.countItem(item, context.bot.items)
            if (numHas > (numHold / 4)) continue
            const numWant = numHold - numHas
            if (!context.bot.canBuy(item, { ignoreLocation: true, quantity: numWant })) continue

            return [replenishStrategy]
        }
    }

    return null
}

export function getFarmingStrategies(
    context: Strategist<PingCompensatedCharacter>,
    huntId: string | null,
    huntManager: HuntManager,
): Strategy<PingCompensatedCharacter>[] {
    if (!huntId) return []

    const moveStrategy = getHuntMoveStrategy(huntManager, huntId)
    const attackStrategy = getHuntAttackStrategy(huntManager, huntId, context.bot.ctype)

    const strategies: Strategy<PingCompensatedCharacter>[] = []
    if (moveStrategy) strategies.push(moveStrategy)
    if (attackStrategy) strategies.push(attackStrategy)

    return strategies
}
