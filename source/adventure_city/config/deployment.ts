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
            {
                id: "party_test1",
                name: "Test1 Party",
                members: [
                    "test_1_1", "test_1_2", "test_1_3",
                    "test_2_1", "test_2_2", "test_2_3",
                    "test_3_1", "test_3_2", "test_3_3",
                ],
                leader: "test_1_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test4",
                name: "Test4 Party",
                members: [
                    "test_4_1", "test_4_2", "test_4_3",
                    "test_5_1", "test_5_2", "test_5_3",
                    "test_6_1", "test_6_2", "test_6_3",
                ],
                leader: "test_4_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test7",
                name: "Test7 Party",
                members: [
                    "test_7_1", "test_7_2", "test_7_3",
                    "test_8_1", "test_8_2", "test_8_3",
                    "test_9_1", "test_9_2", "test_9_3",
                ],
                leader: "test_7_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test10",
                name: "Test10 Party",
                members: [
                    "test_10_1", "test_10_2", "test_10_3",
                    "test_11_1", "test_11_2", "test_11_3",
                    "test_12_1", "test_12_2", "test_12_3",
                ],
                leader: "test_10_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test13",
                name: "Test13 Party",
                members: [
                    "test_13_1", "test_13_2", "test_13_3",
                    "test_14_1", "test_14_2", "test_14_3",
                    "test_15_1", "test_15_2", "test_15_3",
                ],
                leader: "test_13_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test16",
                name: "Test16 Party",
                members: [
                    "test_16_1", "test_16_2", "test_16_3",
                    "test_17_1", "test_17_2", "test_17_3",
                    "test_18_1", "test_18_2", "test_18_3",
                ],
                leader: "test_16_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test19",
                name: "Test19 Party",
                members: [
                    "test_19_1", "test_19_2", "test_19_3",
                    "test_20_1", "test_20_2", "test_20_3",
                    "test_21_1", "test_21_2", "test_21_3",
                ],
                leader: "test_19_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test22",
                name: "Test22 Party",
                members: [
                    "test_22_1", "test_22_2", "test_22_3",
                    "test_23_1", "test_23_2", "test_23_3",
                    "test_24_1", "test_24_2", "test_24_3",
                ],
                leader: "test_22_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test25",
                name: "Test25 Party",
                members: [
                    "test_25_1", "test_25_2", "test_25_3",
                    "test_26_1", "test_26_2", "test_26_3",
                    "test_27_1", "test_27_2", "test_27_3",
                ],
                leader: "test_25_1",
                server: {
                    region: DEFAULT_REGION,
                    identifier: DEFAULT_IDENTIFIER,
                },
                enabled: true,
            },
            {
                id: "party_test28",
                name: "Test28 Party",
                members: [
                    // "test_28_1", "test_28_2", "test_28_3",
                    // "test_29_1", "test_29_2", "test_29_3",
                    // "test_30_1", "test_30_2", "test_30_3",
                ],
                leader: "test_28_1",
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
            {
                id: "hunt_all_tests",
                name: "All Tests Hunt",
                monster: "greenfairy" as MonsterName,
                hunters: [
                    "test_1_1", "test_1_2", "test_1_3",
                    "test_2_1", "test_2_2", "test_2_3",
                    "test_3_1", "test_3_2", "test_3_3",
                    "test_4_1", "test_4_2", "test_4_3",
                    "test_5_1", "test_5_2", "test_5_3",
                    "test_6_1", "test_6_2", "test_6_3",
                    "test_7_1", "test_7_2", "test_7_3",
                    "test_8_1", "test_8_2", "test_8_3",
                    "test_9_1", "test_9_2", "test_9_3",
                    "test_10_1", "test_10_2", "test_10_3",
                    "test_11_1", "test_11_2", "test_11_3",
                    "test_12_1", "test_12_2", "test_12_3",
                    "test_13_1", "test_13_2", "test_13_3",
                    "test_14_1", "test_14_2", "test_14_3",
                    "test_15_1", "test_15_2", "test_15_3",
                    "test_16_1", "test_16_2", "test_16_3",
                    "test_17_1", "test_17_2", "test_17_3",
                    "test_18_1", "test_18_2", "test_18_3",
                    "test_19_1", "test_19_2", "test_19_3",
                    "test_20_1", "test_20_2", "test_20_3",
                    "test_21_1", "test_21_2", "test_21_3",
                    "test_22_1", "test_22_2", "test_22_3",
                    "test_23_1", "test_23_2", "test_23_3",
                    "test_24_1", "test_24_2", "test_24_3",
                    "test_25_1", "test_25_2", "test_25_3",
                    "test_26_1", "test_26_2", "test_26_3",
                    "test_27_1", "test_27_2", "test_27_3",
                    // "test_28_1", "test_28_2", "test_28_3",
                    // "test_29_1", "test_29_2", "test_29_3",
                    // "test_30_1", "test_30_2", "test_30_3",
                ],
                enabled: true,
            },
        ],
        merchants: [
            {
                id: "merchant_hold2",
                characterName: "Hold2",
                servedParties: ["party_test1", "party_test4", "party_test7", "party_test10", "party_test13", "party_test16", "party_test19", "party_test22", "party_test25", "party_test28"],
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
