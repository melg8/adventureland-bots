import AL, { CharacterType, IPosition, ItemName, MonsterName, ServerIdentifier, ServerRegion } from "alclient"
import { DEFAULT_IDENTIFIER, DEFAULT_REGION } from "../../base/defaults.js"
import { DeploymentConfig, PartyDefinition, HuntDefinition, MerchantDefinition } from "./types.js"

export const DEFAULT_ITEM_CONFIG = {
    "cclaw": { sell: true, sellPrice: "npc" as const },
    "hpamulet": { sell: true, sellPrice: "npc" as const },
    "hpbelt": { sell: true, sellPrice: "npc" as const },
    "stinger": { sell: true, sellPrice: "npc" as const },
    "wcap": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 8 },
    "wshoes": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 8 },
    "ringsj": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 4 },
    "sshield": { buy: true, buyPrice: "ponty" as const, useScroll1FromLevel: 1, useScroll2FromLevel: 6, upgradeUntilLevel: 8 },
    "elixirluck": { hold: true, holdSlot: 37, replenish: 4 },
    "hpot1": { hold: true, holdSlot: 39, replenish: 2000 },
    "mpot1": { hold: true, holdSlot: 38, replenish: 2000 },
    "computer": { hold: true, holdSlot: 40 },
    "tracker": { hold: true, holdSlot: 41 },
}

export const DEFAULT_REPLENISHABLES = new Map<ItemName, number>([
    ["hpot1", 2500],
    ["mpot1", 2500],
    ["elixirluck", 4],
])

export const MERCHANT_GOLD_TO_HOLD = 3_000_000

export function createDefaultDeployment(): DeploymentConfig {
    return {
        parties: [
            {
                id: "party_all",
                name: "All Combat Bots",
                members: [
                    "Lucky2", "Melok2", "Orca2",
                    "Lucky3", "Melok3", "Orca3",
                    "Lucky4", "Melok4", "Orca4",
                ],
                leader: "Lucky2",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
        ],
        hunts: [
            {
                id: "hunt_armadillo",
                name: "Armadillo Farm",
                monster: "armadillo" as MonsterName,
                hunters: [
                    "Lucky2", "Melok2", "Orca2",
                    "Lucky3", "Melok3", "Orca3",
                    "Lucky4", "Melok4", "Orca4",
                ],
                enabled: true,
            },
        ],
        merchants: [
            {
                id: "merchant_hold2",
                characterName: "Hold2",
                servedParties: ["party_all"],
                position: { map: "main", x: 0, y: 0 },
                enabled: true,
            },
        ],
    }
}

export function validateDeployment(config: DeploymentConfig): string[] {
    const errors: string[] = []

    for (const party of config.parties) {
        if (!party.id) errors.push("Party missing id")
        if (!party.name) errors.push(`Party ${party.id} missing name`)
        if (!party.leader) errors.push(`Party ${party.id} missing leader`)
        if (party.members.length === 0) errors.push(`Party ${party.id} has no members`)
        if (!party.members.includes(party.leader)) {
            errors.push(`Party ${party.id} leader ${party.leader} not in members list`)
        }
        if (party.members.length > 9) {
            errors.push(`Party ${party.id} has ${party.members.length} members (max 9)`)
        }
    }

    const allPartyMembers = new Set<string>()
    for (const party of config.parties) {
        for (const member of party.members) {
            if (allPartyMembers.has(member)) {
                errors.push(`Character ${member} is in multiple parties`)
            }
            allPartyMembers.add(member)
        }
    }

    for (const hunt of config.hunts) {
        if (!hunt.id) errors.push("Hunt missing id")
        if (!hunt.monster) errors.push(`Hunt ${hunt.id} missing monster`)
        if (hunt.hunters.length === 0) errors.push(`Hunt ${hunt.id} has no hunters`)

        for (const hunter of hunt.hunters) {
            if (!allPartyMembers.has(hunter)) {
                errors.push(`Hunt ${hunt.id} references unknown character ${hunter}`)
            }
        }
    }

    const allHunters = new Set<string>()
    for (const hunt of config.hunts) {
        for (const hunter of hunt.hunters) {
            if (allHunters.has(hunter)) {
                errors.push(`Character ${hunter} is in multiple hunt groups`)
            }
            allHunters.add(hunter)
        }
    }

    for (const merchant of config.merchants) {
        if (!merchant.id) errors.push("Merchant missing id")
        if (!merchant.characterName) errors.push(`Merchant ${merchant.id} missing characterName`)
        if (merchant.servedParties.length === 0) {
            errors.push(`Merchant ${merchant.id} serves no parties`)
        }
        for (const partyId of merchant.servedParties) {
            if (!config.parties.find(p => p.id === partyId)) {
                errors.push(`Merchant ${merchant.id} references unknown party ${partyId}`)
            }
        }
    }

    return errors
}
