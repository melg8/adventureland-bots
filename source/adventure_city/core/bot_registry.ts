import AL, { CharacterType, PingCompensatedCharacter, ServerIdentifier, ServerRegion } from "alclient"
import { Strategist } from "../../strategy_pattern/context.js"
import { AccountConfig, BotRecord, BotRegistry, DeploymentConfig, PartyDefinition } from "../config/types.js"

export function buildBotRegistry(
    accountConfigs: AccountConfig[],
    deploymentConfig: DeploymentConfig,
): BotRegistry {
    const bots = new Map<string, BotRecord>()
    const byName = new Map<string, BotRecord>()
    const byAccountId = new Map<string, BotRecord[]>()

    const characterToParty = new Map<string, string>()
    for (const party of deploymentConfig.parties) {
        for (const member of party.members) {
            characterToParty.set(member, party.id)
        }
    }

    const characterToHunt = new Map<string, string>()
    for (const hunt of deploymentConfig.hunts) {
        for (const hunter of hunt.hunters) {
            characterToHunt.set(hunter, hunt.id)
        }
    }

    const allEnabledChars = new Map<string, {
        accountName: string
        credentials: { userID: string; userAuth: string }
        name: string
        type: CharacterType
        id: string
        isPartyLeader: boolean
    }>()

    for (const account of accountConfigs) {
        const accountBots: BotRecord[] = []

        for (const char of account.characters) {
            if (!char.enabled) continue

            const isCombat = char.type !== "merchant"
            const isInParty = isCombat && characterToParty.has(char.name)
            const isInHunt = isCombat && characterToHunt.has(char.name)

            if (isCombat && !isInParty) {
                console.log(`[REGISTRY] Combat character ${char.name} is not assigned to any party, skipping`)
                continue
            }

            if (isCombat && !isInHunt) {
                console.log(`[REGISTRY] Combat character ${char.name} is not assigned to any hunt group, skipping`)
                continue
            }

            const isMerchant = char.type === "merchant"
            const merchantDef = deploymentConfig.merchants.find(m => m.characterName === char.name)
            if (isMerchant && !merchantDef) {
                console.log(`[REGISTRY] Merchant ${char.name} is not in deployment config, skipping`)
                continue
            }
            if (isMerchant && !merchantDef?.enabled) {
                console.log(`[REGISTRY] Merchant ${char.name} is disabled in deployment config, skipping`)
                continue
            }

            const botId = `${account.accountName}:${char.name}`
            const partyId = characterToParty.get(char.name) ?? null
            const huntGroupId = characterToHunt.get(char.name) ?? null

            const record: BotRecord = {
                botId,
                accountId: account.accountName,
                characterId: char.id,
                name: char.name,
                type: char.type,
                enabled: true,
                isPartyLeader: char.isPartyLeader ?? false,
                partyId,
                huntGroupId,
                context: null,
                state: "offline",
                credentials: account.credentials,
            }

            bots.set(botId, record)
            byName.set(char.name, record)
            accountBots.push(record)

            console.log(`[REGISTRY] Registered bot: ${char.name} (${char.type}) -> party: ${partyId ?? "none"}, hunt: ${huntGroupId ?? "none"}`)
        }

        if (accountBots.length > 0) {
            byAccountId.set(account.accountName, accountBots)
        }
    }

    console.log(`[REGISTRY] Total registered bots: ${bots.size}`)

    return { bots, byName, byAccountId }
}

export function getCombatBots(registry: BotRegistry): BotRecord[] {
    return Array.from(registry.bots.values()).filter(b => b.type !== "merchant")
}

export function getMerchantBots(registry: BotRegistry): BotRecord[] {
    return Array.from(registry.bots.values()).filter(b => b.type === "merchant")
}

export function getBotsByParty(registry: BotRegistry, partyId: string): BotRecord[] {
    return Array.from(registry.bots.values()).filter(b => b.partyId === partyId)
}

export function getBotsByHunt(registry: BotRegistry, huntId: string): BotRecord[] {
    return Array.from(registry.bots.values()).filter(b => b.huntGroupId === huntId)
}

export function getBotByName(registry: BotRegistry, name: string): BotRecord | undefined {
    return registry.byName.get(name)
}
