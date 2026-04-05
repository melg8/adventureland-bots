import AL, { CharacterType, IPosition, ItemName, MapName, MonsterName, PingCompensatedCharacter, ServerIdentifier, ServerRegion } from "alclient"
import { Strategist, Strategy } from "../../strategy_pattern/context.js"

export type BotState = "offline" | "connecting" | "ready" | "farming" | "banking" | "buying" | "dead" | "stopped"

export type XPRotationTrigger = "kill" | "time"

export interface XPRotationConfig {
    slots: string[][]
    trigger: XPRotationTrigger
    interval: number
}

export interface PartyDefinition {
    id: string
    name: string
    members: string[]
    leader: string
    server: { region: string; identifier: string }
    enabled: boolean
}

export interface HuntDefinition {
    id: string
    name: string
    monster: MonsterName
    location?: { map: MapName; x: number; y: number }
    hunters: string[]
    xpRotation?: XPRotationConfig
    enabled: boolean
}

export interface MerchantDefinition {
    id: string
    characterName: string
    servedParties: string[]
    position: IPosition
    enabled: boolean
}

export interface DeploymentConfig {
    parties: PartyDefinition[]
    hunts: HuntDefinition[]
    merchants: MerchantDefinition[]
}

export interface AccountConfig {
    accountName: string
    credentials: {
        userID: string
        userAuth: string
    }
    characters: {
        enabled: boolean
        name: string
        type: CharacterType
        id: string
        isPartyLeader?: boolean
    }[]
}

export interface BotRecord {
    botId: string
    accountId: string
    characterId: string
    name: string
    type: CharacterType
    enabled: boolean
    isPartyLeader: boolean
    partyId: string | null
    huntGroupId: string | null
    context: Strategist<PingCompensatedCharacter> | null
    state: BotState
    credentials: { userID: string; userAuth: string }
}

export interface PartyRecord {
    id: string
    name: string
    leaderBotId: string
    server: { region: ServerRegion; identifier: ServerIdentifier }
    memberBotIds: string[]
    enabled: boolean
    contexts: Strategist<PingCompensatedCharacter>[]
}

export interface HuntGroupRecord {
    id: string
    name: string
    monster: MonsterName
    location: IPosition | null
    hunterBotIds: string[]
    xpRotation: XPRotationConfig | null
    enabled: boolean
    contexts: Strategist<PingCompensatedCharacter>[]
    attackStrategies: Map<CharacterType, Strategy<PingCompensatedCharacter>>
    moveStrategy: Strategy<PingCompensatedCharacter> | null
}

export interface MerchantRecord {
    id: string
    botId: string
    servedPartyIds: string[]
    position: IPosition
    context: Strategist<PingCompensatedCharacter> | null
    enabled: boolean
    fighterContexts: Strategist<PingCompensatedCharacter>[]
}

export interface BotRegistry {
    bots: Map<string, BotRecord>
    byName: Map<string, BotRecord>
    byAccountId: Map<string, BotRecord[]>
}

export interface PartyManager {
    parties: Map<string, PartyRecord>
    botToParty: Map<string, string>
}

export interface HuntManager {
    hunts: Map<string, HuntGroupRecord>
    botToHunt: Map<string, string>
}

export interface MerchantManager {
    merchants: Map<string, MerchantRecord>
    partyToMerchant: Map<string, string>
}

export interface DeploymentState {
    registry: BotRegistry
    parties: PartyManager
    hunts: HuntManager
    merchants: MerchantManager
    allCombatContexts: Strategist<PingCompensatedCharacter>[]
    allContexts: Strategist<PingCompensatedCharacter>[]
}
