import AL, { CharacterType, ItemName, Mage, Merchant, Paladin, PingCompensatedCharacter, Priest, Ranger, Rogue, ServerIdentifier, ServerRegion, Warrior } from "alclient"
import { AvoidStackingStrategy } from "../strategy_pattern/strategies/avoid_stacking.js"
import { BaseStrategy } from "../strategy_pattern/strategies/base.js"
import { BuyStrategy } from "../strategy_pattern/strategies/buy.js"
import { ChargeStrategy } from "../strategy_pattern/strategies/charge.js"
import { Strategist, Strategy } from "../strategy_pattern/context.js"
import { ElixirStrategy } from "../strategy_pattern/strategies/elixir.js"
import { ItemStrategy } from "../strategy_pattern/strategies/item.js"
import { MagiportOthersSmartMovingToUsStrategy } from "../strategy_pattern/strategies/magiport.js"
import { AcceptPartyRequestStrategy, RequestPartyStrategy } from "../strategy_pattern/strategies/party.js"
import { PartyHealStrategy } from "../strategy_pattern/strategies/partyheal.js"
import { RespawnStrategy } from "../strategy_pattern/strategies/respawn.js"
import { GiveRogueSpeedStrategy } from "../strategy_pattern/strategies/rspeed.js"
import { SellStrategy } from "../strategy_pattern/strategies/sell.js"

import { MageAttackStrategy } from "../strategy_pattern/strategies/attack_mage.js"
import { PaladinAttackStrategy } from "../strategy_pattern/strategies/attack_paladin.js"
import { PriestAttackStrategy } from "../strategy_pattern/strategies/attack_priest.js"
import { RangerAttackStrategy } from "../strategy_pattern/strategies/attack_ranger.js"
import { RogueAttackStrategy } from "../strategy_pattern/strategies/attack_rogue.js"
import { WarriorAttackStrategy } from "../strategy_pattern/strategies/attack_warrior.js"
import { GetHolidaySpiritStrategy, GetReplenishablesStrategy, ImprovedMoveStrategy } from "../strategy_pattern/strategies/move.js"
import { MoveToBankAndDepositStuffStrategy } from "../strategy_pattern/strategies/bank.js"
import { BaseAttackStrategy } from "../strategy_pattern/strategies/attack.js"
import { DEFAULT_IDENTIFIER, DEFAULT_REGION } from "../base/defaults.js"
import { AvoidDeathStrategy } from "../strategy_pattern/strategies/avoid_death.js"
import { ItemConfig } from "../base/itemsNew.js"
import { startMerchant as startMerchantStrategy, defaultNewMerchantStrategyOptions, NewMerchantStrategyOptions } from "../merchant/strategy.js"
import { ToggleStandStrategy } from "../strategy_pattern/strategies/stand.js"
import { TrackerStrategy } from "../strategy_pattern/strategies/tracker.js"

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// ============================================================================
// INITIALIZE GAME DATA (must happen before strategies are created)
// ============================================================================

// Configure for LOCAL server (not Steam)
AL.Game.setServer("http://127.0.0.1:8090")  // Your local server URL
await Promise.all([AL.Game.loginJSONFile("../../credentials.json", false), AL.Game.getGData(true)])
await AL.Pathfinder.prepare(AL.Game.G, { cheat: true })

// await AL.Game.updateServersAndCharacters()


// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Path to folder containing account JSON files
 * Each JSON file should have this format:
 * {
 *   "accountName": "leeroi2",
 *   "credentials": {
 *     "userID": "1234567890123456",
 *     "userAuth": "abcdefghijklmnopqrs"
 *   },
 *   "characters": [
 *     { "enabled": true, "name": "Lucky2", "type": "mage", "isPartyLeader": true },
 *     { "enabled": true, "name": "Melok2", "type": "priest", "isPartyLeader": false }
 *   ]
 * }
 */
const ACCOUNTS_FOLDER = "accounts"

/**
 * Item configuration for crab farming
 */
const CRABRAVE_ITEM_CONFIG: ItemConfig = {
    "cclaw": { 
        hold: true, 
        upgradeUntilLevel: 9,
    },
    "computer": { hold: true, holdSlot: 40 },
    "crabclaw": { 
        hold: true, 
    },
    "ringsj": {
        hold: true,
        upgradeUntilLevel: 4
    },
    "hpamulet": { sell: true, sellPrice: "npc" },
    "hpbelt": { sell: true, sellPrice: "npc" },
    "elixirluck": {hold: true, holdSlot: 37, replenish: 4},
    "hpot1": { hold: true, holdSlot: 39, replenish: 1000 },
    "mpot1": { hold: true, holdSlot: 38, replenish: 1000 },
    "tracker": { hold: true, holdSlot: 41 },
    "wcap": { 
        hold: true, 
        sellPrice: "npc",
        upgradeUntilLevel: 9
    },
    "wshoes": { 
        hold: true,
        upgradeUntilLevel: 9
    }
}

const REPLENISHABLES = new Map<ItemName, number>([
    ["hpot1", 2500],
    ["mpot1", 2500],
    ["elixirluck", 4],
])

const SERVER_REGION: ServerRegion = DEFAULT_REGION
const SERVER_IDENTIFIER: ServerIdentifier = DEFAULT_IDENTIFIER
const MAX_CHARS = 9

// ============================================================================
// ACCOUNT CONFIGURATION LOADING
// ============================================================================

interface AccountConfig {
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

function loadAccountConfigs(): AccountConfig[] {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const accountsPath = path.resolve(__dirname, "..", "..", ACCOUNTS_FOLDER)
    
    const configs: AccountConfig[] = []
    
    if (!fs.existsSync(accountsPath)) {
        console.log(`[CONFIG] Accounts folder not found: ${accountsPath}`)
        console.log(`[CONFIG] Creating folder. Add your account JSON files there.`)
        fs.mkdirSync(accountsPath, { recursive: true })
        return configs
    }
    
    const files = fs.readdirSync(accountsPath).filter(f => f.endsWith(".json"))
    
    if (files.length === 0) {
        console.log(`[CONFIG] No JSON files found in ${accountsPath}`)
        return configs
    }
    
    for (const file of files) {
        try {
            const filePath = path.join(accountsPath, file)
            const content = fs.readFileSync(filePath, "utf-8")
            const config: AccountConfig = JSON.parse(content)
            
            // Validate required fields
            if (!config.accountName) {
                console.warn(`[CONFIG] Skipping ${file}: missing accountName`)
                continue
            }
            if (!config.credentials?.userID || !config.credentials?.userAuth) {
                console.warn(`[CONFIG] Skipping ${file}: missing credentials`)
                continue
            }
            if (!config.characters || !Array.isArray(config.characters)) {
                console.warn(`[CONFIG] Skipping ${file}: missing characters array`)
                continue
            }
            
            configs.push(config)
            console.log(`[CONFIG] Loaded account: ${config.accountName} (${config.characters.length} characters)`)
        } catch (e) {
            console.error(`[CONFIG] Error loading ${file}:`, e)
        }
    }
    
    return configs
}

// ============================================================================
// STRATEGIES
// ============================================================================

const CONTEXTS: Strategist<PingCompensatedCharacter>[] = []

const avoidStackingStrategy = new AvoidStackingStrategy()
const avoidDeathStrategy = new AvoidDeathStrategy()
const bankStrategy = new MoveToBankAndDepositStuffStrategy()
const baseStrategy = new BaseStrategy(CONTEXTS)
const buyStrategy = new BuyStrategy({
    contexts: CONTEXTS,
    itemConfig: CRABRAVE_ITEM_CONFIG
})
const chargeStrategy = new ChargeStrategy()
const elixirStrategy = new ElixirStrategy("elixirluck")
const getHolidaySpiritStrategy = new GetHolidaySpiritStrategy()
const getReplenishablesStrategy = new GetReplenishablesStrategy({
    contexts: CONTEXTS,
    replenishables: REPLENISHABLES
})
const itemStrategy = new ItemStrategy({ contexts: CONTEXTS, itemConfig: CRABRAVE_ITEM_CONFIG })
const magiportStrategy = new MagiportOthersSmartMovingToUsStrategy(CONTEXTS)

const monsterToFarm = "crab";

const moveStrategy = new ImprovedMoveStrategy(monsterToFarm, {
    idlePosition: { map: "main", x: -1111, y: -130 }
})
const attackStrategies: { [T in Exclude<CharacterType, "merchant">]: BaseAttackStrategy<PingCompensatedCharacter> } = {
    mage: new MageAttackStrategy({ contexts: CONTEXTS, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true }),
    paladin: new PaladinAttackStrategy({ contexts: CONTEXTS, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true }),
    priest: new PriestAttackStrategy({ contexts: CONTEXTS, disableCurse: true, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true }),
    ranger: new RangerAttackStrategy({ contexts: CONTEXTS, disableHuntersMark: true, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true }),
    rogue: new RogueAttackStrategy({ contexts: CONTEXTS, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true }),
    warrior: new WarriorAttackStrategy({ contexts: CONTEXTS, disableAgitate: true, type: monsterToFarm, enableTargetDistribution: true, enableTimeDistribution: true })
}

// Merchant configuration
const MERCHANT_GOLD_TO_HOLD = 3_000_000

const partyAcceptStrategy =
    new AcceptPartyRequestStrategy(/** TODO: TEMP: Allow anyone to join { allowList: PARTY_ALLOWLIST } */)
const partyHealStrategy = new PartyHealStrategy(CONTEXTS)
const partyRequestStrategy = new RequestPartyStrategy("")  // Will be set in main()
const respawnStrategy = new RespawnStrategy()
const rspeedStrategy = new GiveRogueSpeedStrategy()
const sellStrategy = new SellStrategy({
    itemConfig: CRABRAVE_ITEM_CONFIG
})

const currentSetups = new Map<
    Strategist<PingCompensatedCharacter>,
    Strategy<PingCompensatedCharacter>[]
>()

const swapStrategies = (context: Strategist<PingCompensatedCharacter>, strategies: Strategy<PingCompensatedCharacter>[]) => {
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

const contextsLogic = async () => {
    try {
        for (const context of CONTEXTS) {
            if (!context.isReady() || !context.bot.ready || context.bot.rip) {
                continue
            }

            // Merchants handle their own logic via NewMerchantStrategy
            if (context.bot.ctype === "merchant") {
                continue
            }

            if (context.bot.S.holidayseason && !context.bot.s.holidayspirit) {
                swapStrategies(context, [getHolidaySpiritStrategy])
                continue
            }

            if (context.bot.esize <= 0) {
                swapStrategies(context, [bankStrategy])
                continue
            }

            for (const [item, numHold] of REPLENISHABLES) {
                const numHas = context.bot.countItem(item, context.bot.items)
                if (numHas > (numHold / 4)) continue
                const numWant = numHold - numHas
                if (!context.bot.canBuy(item, { ignoreLocation: true, quantity: numWant })) continue

                console.info(`swapping for replenish for bot: ${context.bot.name}`)
                swapStrategies(context, [getReplenishablesStrategy])
                return
            }

            swapStrategies(context, [moveStrategy, attackStrategies[context.bot.ctype]])
        }
    } catch (e) {
        console.error(e)
    } finally {
        setTimeout(contextsLogic, 1000)
    }
}
contextsLogic()

async function startShared(context: Strategist<PingCompensatedCharacter>) {
    // Merchants don't join parties or use these strategies
    if (context.bot.ctype === "merchant") {
        return
    }

    context.applyStrategy(partyAcceptStrategy)

    if (context.bot.id !== partyRequestStrategy.partyLeader) {
        context.applyStrategy(partyRequestStrategy)
    }

    context.applyStrategy(buyStrategy)
    context.applyStrategy(sellStrategy)
    context.applyStrategy(avoidStackingStrategy)
    context.applyStrategy(avoidDeathStrategy)
    context.applyStrategy(respawnStrategy)
    context.applyStrategy(elixirStrategy)
    context.applyStrategy(itemStrategy)
    CONTEXTS.push(context)
}

async function startMage(context: Strategist<Mage>) {
    startShared(context)
    context.applyStrategy(magiportStrategy)
}

async function startPaladin(context: Strategist<Paladin>) {
    startShared(context)
}

async function startPriest(context: Strategist<Priest>) {
    startShared(context)
    context.applyStrategy(partyHealStrategy)
}

async function startRanger(context: Strategist<Ranger>) {
    startShared(context)
}

async function startRogue(context: Strategist<Rogue>) {
    startShared(context)
    context.applyStrategy(rspeedStrategy)
}

async function startWarrior(context: Strategist<Warrior>) {
    startShared(context)
    context.applyStrategy(chargeStrategy)
}

async function startMerchant(context: Strategist<Merchant>) {
    // Merchants don't use startShared - they have their own strategy
    CONTEXTS.push(context)

    const merchantFriends = CONTEXTS.filter(c => c.bot.ctype !== "merchant")
    
    console.log(`[MERCHANT] Starting merchant ${context.bot.name}`)
    console.log(`[MERCHANT] Total CONTEXTS: ${CONTEXTS.length}`)
    console.log(`[MERCHANT] Merchant friends (non-merchant): ${merchantFriends.length}`)
    for (const friend of merchantFriends) {
        console.log(`[MERCHANT]   - ${friend.bot.name} (${friend.bot.ctype}) on ${friend.bot.serverData?.region}/${friend.bot.serverData?.name}`)
    }
    console.log(`[MERCHANT] Merchant server: ${context.bot.serverData?.region}/${context.bot.serverData?.name}`)

    const merchantOptions: NewMerchantStrategyOptions = {
        contexts: merchantFriends,
        defaultPosition: {
            map: "main" as const,
            x: 0,
            y: 0,
        },
        goldToHold: MERCHANT_GOLD_TO_HOLD,
        itemConfig: CRABRAVE_ITEM_CONFIG,

        enableMluck: {
            contexts: true,
            others: true,
            self: true,
            travel: true,
        },
    }

    startMerchantStrategy(context, merchantFriends, merchantOptions)

    console.log(`[START] Started merchant: ${context.bot.name}`)
}

const stopCharacter = async (characterName: string) => {
    let context: Strategist<PingCompensatedCharacter>
    for (const find of CONTEXTS) {
        if (find.bot.name !== characterName) continue
        context = find
        break
    }

    if (!context) return
    const publicIndex = CONTEXTS.indexOf(context)
    context.stop()
    CONTEXTS.splice(publicIndex, 1)
    console.log(`[STOP] Stopped character: ${characterName}`)
}

const startCharacter = async (
    credentials: { userID: string; userAuth: string },
    name: string,
    type: CharacterType,
    characterID: string,
    attemptNum = 0
) => {
    // Debug output
    console.log(`[DEBUG] startCharacter called:`)
    console.log(`  - account userID: ${credentials.userID}`)
    console.log(`  - account userAuth: ${credentials.userAuth}`)
    console.log(`  - character name: ${name}`)
    console.log(`  - character type: ${type}`)
    console.log(`  - characterID: ${characterID}`)
    console.log(`  - attemptNum: ${attemptNum}`)
    console.log(`  - SERVER_REGION: ${SERVER_REGION}`)
    console.log(`  - SERVER_IDENTIFIER: ${SERVER_IDENTIFIER}`)
    console.log(`  - AL.Game.servers exists: ${AL.Game.servers ? 'yes' : 'no'}`)
    if (AL.Game.servers) {
        console.log(`  - AL.Game.servers[${SERVER_REGION}]: ${AL.Game.servers[SERVER_REGION] ? 'exists' : 'undefined'}`)
        if (AL.Game.servers[SERVER_REGION]) {
            console.log(`  - AL.Game.servers[${SERVER_REGION}][${SERVER_IDENTIFIER}]: ${JSON.stringify(AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])}`)
        }
    }

    for (let i = 0; i < CONTEXTS.length; i++) {
        const context = CONTEXTS[i]
        if (context.isStopped() && context.bot.name) {
            await stopCharacter(context.bot.name)
            i -= 1
        }
    }

    if (CONTEXTS.length >= MAX_CHARS) throw `Too many characters are already running (We only support ${MAX_CHARS} characters)`
    for (const context of CONTEXTS) {
        if (context.bot.name == name) throw `Character '${name}' is already running!`
    }

    let bot: PingCompensatedCharacter
    try {
        const serverData = AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER]
        console.log(`[DEBUG] Creating ${type} instance for ${name}...`)
        console.log(`  Arguments:`)
        console.log(`    - userID: ${credentials.userID}`)
        console.log(`    - userAuth: ${credentials.userAuth}`)
        console.log(`    - characterID: ${characterID}`)
        console.log(`    - name: ${name}`)
        console.log(`    - G: ${AL.Game.G ? 'defined' : 'undefined'}`)
        console.log(`    - server: ${JSON.stringify(serverData)}`)

        switch (type) {
            case "mage": {
                bot = new AL.Mage(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "paladin": {
                bot = new AL.Paladin(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "priest": {
                bot = new AL.Priest(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "ranger": {
                bot = new AL.Ranger(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "rogue": {
                bot = new AL.Rogue(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "warrior": {
                bot = new AL.Warrior(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            case "merchant": {
                bot = new AL.Merchant(credentials.userID, credentials.userAuth, characterID, AL.Game.G, serverData)
                break
            }
            default: {
                throw new Error(`Unsupported character type: ${type}`)
            }
        }
        await bot.connect()
    } catch (e) {
        if (bot) bot.disconnect()
        console.error(`[ERROR] Failed to connect ${name}:`, e)
        if (/nouser/.test(e)) {
            throw new Error(`Authorization failed for ${name}!`)
        }
        attemptNum += 1
        if (attemptNum < 2) {
            setTimeout(startCharacter, 1_000, credentials, name, type, characterID, attemptNum)
        } else {
            throw new Error(`Failed starting ${name}!`)
        }
        return
    }

    let context: Strategist<PingCompensatedCharacter>
    switch (type) {
        case "mage": {
            context = new Strategist<Mage>(bot as Mage, baseStrategy)
            startMage(context as Strategist<Mage>).catch(console.error)
            break
        }
        case "paladin": {
            context = new Strategist<Paladin>(bot as Paladin, baseStrategy)
            startPaladin(context as Strategist<Paladin>).catch(console.error)
            break
        }
        case "priest": {
            context = new Strategist<Priest>(bot as Priest, baseStrategy)
            startPriest(context as Strategist<Priest>).catch(console.error)
            break
        }
        case "ranger": {
            context = new Strategist<Ranger>(bot as Ranger, baseStrategy)
            startRanger(context as Strategist<Ranger>).catch(console.error)
            break
        }
        case "rogue": {
            context = new Strategist<Rogue>(bot as Rogue, baseStrategy)
            startRogue(context as Strategist<Rogue>).catch(console.error)
            break
        }
        case "warrior": {
            context = new Strategist<Warrior>(bot as Warrior, baseStrategy)
            startWarrior(context as Strategist<Warrior>).catch(console.error)
            break
        }
        case "merchant": {
            context = new Strategist<Merchant>(bot as Merchant, baseStrategy)
            startMerchant(context as Strategist<Merchant>).catch(console.error)
            break
        }
    }

    console.log(`[START] Started character: ${name} (${type})`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log("")
    console.log("╔═══════════════════════════════════════════════════════════╗")
    console.log("║         Crabrave Local - Multi-Account Bot                ║")
    console.log("╚═══════════════════════════════════════════════════════════╝")
    console.log("")

    // Load account configurations from JSON files
    console.log("[CONFIG] Loading account configurations...")
    const accountConfigs = loadAccountConfigs()
    
    if (accountConfigs.length === 0) {
        console.log("")
        console.log("┌───────────────────────────────────────────────────────────┐")
        console.log("│  NO ACCOUNT CONFIGURATIONS FOUND                          │")
        console.log("├───────────────────────────────────────────────────────────┤")
        console.log("│  1. Run getCredentials.js in Adventure Land               │")
        console.log("│  2. Copy the JSON output                                  │")
        console.log("│  3. Save as accounts/youraccount.json                     │")
        console.log("│  4. Repeat for each account                               │")
        console.log("│  5. Run this bot again                                    │")
        console.log("└───────────────────────────────────────────────────────────┘")
        console.log("")
        return
    }
    
    console.log(`[CONFIG] Loaded ${accountConfigs.length} account(s)`)
    console.log("")

    // Collect all enabled characters from all accounts
    const allCharacters: {
        accountName: string
        credentials: { userID: string; userAuth: string }
        name: string
        type: CharacterType
        id: string
        isPartyLeader?: boolean
    }[] = []

    for (const config of accountConfigs) {
        const enabledChars = config.characters.filter(c => c.enabled)
        for (const char of enabledChars) {
            allCharacters.push({
                accountName: config.accountName,
                credentials: config.credentials,
                name: char.name,
                type: char.type,
                id: char.id,
                isPartyLeader: char.isPartyLeader
            })
        }
    }
    
    // Determine party leader (exclude merchants)
    const nonMerchantCharacters = allCharacters.filter(c => c.type !== "merchant")
    const partyLeader = nonMerchantCharacters.find(c => c.isPartyLeader) || nonMerchantCharacters[0]
    if (partyLeader) {
        partyRequestStrategy.partyLeader = partyLeader.name
    }
    
    console.log("┌─────────────────────────────────────────────────────────────┐")
    console.log("│  CHARACTER CONFIGURATION                                    │")
    console.log("├─────────────────────────────────────────────────────────────┤")
    console.log(`│  Total accounts: ${accountConfigs.length}                                      │`)
    console.log(`│  Enabled characters: ${allCharacters.length}                                    │`)
    if (partyLeader) {
        console.log(`│  Party leader: ${partyLeader.name.padEnd(44)}│`)
    }
    console.log("├─────────────────────────────────────────────────────────────┤")
    console.log("│  Characters to start:                                       │")
    for (const char of allCharacters) {
        const line = `│    - ${char.name} (${char.type}) [${char.accountName}]`
        console.log(line.padEnd(60, " ") + "│")
    }
    console.log("└─────────────────────────────────────────────────────────────┘")
    console.log("")

    console.log("Starting characters...")
    console.log("")
    
    // Start combat bots first, then merchant
    // This ensures the merchant has contexts to work with when it starts
    const combatCharacters = allCharacters.filter(c => c.type !== "merchant")
    const merchantCharacters = allCharacters.filter(c => c.type === "merchant")
    
    console.log(`[STARTUP] Starting ${combatCharacters.length} combat bot(s) first...`)
    for (const char of combatCharacters) {
        try {
            await startCharacter(char.credentials, char.name, char.type, char.id)
        } catch (e) {
            console.error(`[ERROR] Failed to start ${char.name}:`, e)
        }
    }
    
    console.log(`[STARTUP] Starting ${merchantCharacters.length} merchant(s)...`)
    for (const char of merchantCharacters) {
        try {
            await startCharacter(char.credentials, char.name, char.type, char.id)
        } catch (e) {
            console.error(`[ERROR] Failed to start ${char.name}:`, e)
        }
    }

    console.log("")
    console.log("═".repeat(60))
    console.log("All characters processed!")
    console.log("═".repeat(60))
}

main().catch(console.error)
