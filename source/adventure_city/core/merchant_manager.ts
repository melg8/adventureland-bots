import AL, { IPosition, PingCompensatedCharacter } from "alclient"
import { Strategist } from "../../strategy_pattern/context.js"
import { BotRegistry, DeploymentConfig, HuntDefinition, MerchantDefinition, MerchantManager, MerchantRecord, PartyDefinition } from "../config/types.js"

export function buildMerchantManager(
    registry: BotRegistry,
    merchantDefs: MerchantDefinition[],
    partyDefs: PartyDefinition[],
): MerchantManager {
    const merchants = new Map<string, MerchantRecord>()
    const partyToMerchant = new Map<string, string>()

    for (const def of merchantDefs) {
        if (!def.enabled) continue

        const botRecord = registry.byName.get(def.characterName)
        if (!botRecord) {
            console.log(`[MERCHANT] Character ${def.characterName} not found in registry, skipping merchant ${def.id}`)
            continue
        }

        const record: MerchantRecord = {
            id: def.id,
            botId: botRecord.botId,
            servedPartyIds: def.servedParties,
            position: def.position,
            context: null,
            enabled: def.enabled,
            fighterContexts: [],
        }

        merchants.set(def.id, record)

        for (const partyId of def.servedParties) {
            if (!partyToMerchant.has(partyId)) {
                partyToMerchant.set(partyId, def.id)
            } else {
                console.log(`[MERCHANT] Party ${partyId} already has a merchant, ${def.id} will be secondary`)
            }
        }

        console.log(`[MERCHANT] Created merchant: ${def.characterName} (${def.id}), serving parties: ${def.servedParties.join(", ")}`)
    }

    return { merchants, partyToMerchant }
}

export function getMerchantForParty(merchantManager: MerchantManager, partyId: string): MerchantRecord | null {
    const merchantId = merchantManager.partyToMerchant.get(partyId)
    if (!merchantId) return null
    return merchantManager.merchants.get(merchantId) ?? null
}

export function getFighterContextsForMerchant(
    merchantManager: MerchantManager,
    merchantId: string,
    registry: BotRegistry,
): Strategist<PingCompensatedCharacter>[] {
    const merchant = merchantManager.merchants.get(merchantId)
    if (!merchant) return []

    const contexts: Strategist<PingCompensatedCharacter>[] = []

    for (const partyId of merchant.servedPartyIds) {
        for (const [botId, bot] of registry.bots) {
            if (bot.partyId === partyId && bot.type !== "merchant" && bot.context) {
                contexts.push(bot.context)
            }
        }
    }

    return contexts
}

export function updateMerchantContexts(merchantManager: MerchantManager, registry: BotRegistry) {
    for (const [merchantId, merchant] of merchantManager.merchants) {
        merchant.context = registry.bots.get(merchant.botId)?.context ?? null
        merchant.fighterContexts = getFighterContextsForMerchant(merchantManager, merchantId, registry)
    }
}
