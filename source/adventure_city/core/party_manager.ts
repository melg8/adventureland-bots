import AL, { PingCompensatedCharacter, ServerIdentifier, ServerRegion } from "alclient"
import { Strategist } from "../../strategy_pattern/context.js"
import { BotRegistry, PartyDefinition, PartyManager, PartyRecord } from "../config/types.js"
import { getBotsByParty } from "./bot_registry.js"

export function buildPartyManager(
    registry: BotRegistry,
    partyDefs: PartyDefinition[],
): PartyManager {
    const parties = new Map<string, PartyRecord>()
    const botToParty = new Map<string, string>()

    for (const def of partyDefs) {
        if (!def.enabled) continue

        const bots = getBotsByParty(registry, def.id)
        const memberBotIds = bots.map(b => b.botId)

        let leaderBotId = ""
        const leaderDef = def.leader
        const leaderBot = bots.find(b => b.name === leaderDef)
        if (leaderBot) {
            leaderBotId = leaderBot.botId
        } else {
            const firstNonMerchant = bots.find(b => b.type !== "merchant")
            if (firstNonMerchant) {
                leaderBotId = firstNonMerchant.botId
                console.log(`[PARTY] Leader ${leaderDef} not found in party ${def.id}, using ${firstNonMerchant.name} instead`)
            }
        }

        const record: PartyRecord = {
            id: def.id,
            name: def.name,
            leaderBotId,
            server: {
                region: def.server.region as ServerRegion,
                identifier: def.server.identifier as ServerIdentifier,
            },
            memberBotIds,
            enabled: def.enabled,
            contexts: [],
        }

        parties.set(def.id, record)

        for (const botId of memberBotIds) {
            botToParty.set(botId, def.id)
        }

        console.log(`[PARTY] Created party: ${def.name} (${def.id}), leader: ${leaderBotId}, members: ${memberBotIds.length}`)
    }

    return { parties, botToParty }
}

export function getPartyLeaderName(partyManager: PartyManager, registry: BotRegistry, partyId: string): string | null {
    const party = partyManager.parties.get(partyId)
    if (!party) return null

    const leaderBot = registry.bots.get(party.leaderBotId)
    return leaderBot?.name ?? null
}

export function getPartyContexts(partyManager: PartyManager, partyId: string): Strategist<PingCompensatedCharacter>[] {
    const party = partyManager.parties.get(partyId)
    return party?.contexts ?? []
}

export function updatePartyContexts(partyManager: PartyManager, registry: BotRegistry) {
    for (const [partyId, party] of partyManager.parties) {
        party.contexts = []
        for (const botId of party.memberBotIds) {
            const bot = registry.bots.get(botId)
            if (bot?.context) {
                party.contexts.push(bot.context)
            }
        }
    }
}
