import AL, { CharacterType, ItemName, Mage, Paladin, PingCompensatedCharacter, Priest, Ranger, Rogue, ServerIdentifier, ServerRegion, Warrior } from "alclient"
import { AvoidStackingStrategy } from "../strategy_pattern/strategies/avoid_stacking.js"
import { BaseStrategy } from "../strategy_pattern/strategies/base.js"
import { BuyStrategy } from "../strategy_pattern/strategies/buy.js"
import { ChargeStrategy } from "../strategy_pattern/strategies/charge.js"
import { Strategist, Strategy } from "../strategy_pattern/context.js"
import { ElixirStrategy } from "../strategy_pattern/strategies/elixir.js"
import { ItemStrategy } from "../strategy_pattern/strategies/item.js"
import { MagiportOthersSmartMovingToUsStrategy } from "../strategy_pattern/strategies/magiport.js"
import { RequestPartyStrategy } from "../strategy_pattern/strategies/party.js"
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

// ============== CONFIGURATION ==============

/**
 * ============================================================================
 * HOW TO GET YOUR CREDENTIALS (user_id and user_auth)
 * ============================================================================
 * 
 * 1. Log into Adventure Land with the account you want to get credentials for
 * 
 * 2. Open the code editor in-game (press 'J' or click the code icon)
 * 
 * 3. Paste and run this code:
 * 
 *    console.log("user_id:", parent.user_id)
 *    console.log("user_auth:", parent.user_auth)
 * 
 * 4. Open your browser's developer console (F12)
 * 
 * 5. Copy the values from the console output
 * 
 * 6. Paste them into the ACCOUNTS section below
 * 
 * ============================================================================
 */

/**
 * Account credentials - add as many accounts as needed
 * Replace the placeholder values with your actual credentials
 */
const ACCOUNTS = {
    leeroi2: {
        userID: "YOUR_LEEROI2_USER_ID",      // 16 digits - Get from in-game console
        userAuth: "YOUR_LEEROI2_AUTH_CODE",  // 21 characters - Get from in-game console
    },
    leeroi3: {
        userID: "YOUR_LEEROI3_USER_ID",      // 16 digits - Get from in-game console
        userAuth: "YOUR_LEEROI3_AUTH_CODE",  // 21 characters - Get from in-game console
    },
}

/**
 * Character configuration
 * - enabled: true/false to enable/disable the character
 * - account: key name from ACCOUNTS object
 * - name: character name in-game
 * - type: character class
 * - isPartyLeader: true for the main character others will party to
 */
const CHARACTERS: {
    enabled: boolean
    account: keyof typeof ACCOUNTS
    name: string
    type: CharacterType
    isPartyLeader?: boolean
}[] = [
    // Account: leeroi2
    { enabled: true, account: "leeroi2", name: "Lucky2", type: "mage", isPartyLeader: true },
    { enabled: true, account: "leeroi2", name: "Melok2", type: "priest" },
    { enabled: true, account: "leeroi2", name: "Orca2", type: "rogue" },
    { enabled: false, account: "leeroi2", name: "DisabledChar2", type: "warrior" }, // Disabled

    // Account: leeroi3
    { enabled: true, account: "leeroi3", name: "Lucky3", type: "mage" },
    { enabled: true, account: "leeroi3", name: "Melok3", type: "priest" },
    { enabled: false, account: "leeroi3", name: "DisabledChar3", type: "paladin" }, // Disabled
]

const SERVER_REGION: ServerRegion = DEFAULT_REGION
const SERVER_IDENTIFIER: ServerIdentifier = DEFAULT_IDENTIFIER
const MAX_CHARS = 9

const REPLENISHABLES = new Map<ItemName, number>([
    ["hpot1", 2500],
    ["mpot1", 2500],
])

const CRABRAVE_ITEM_CONFIG: ItemConfig = {
    "cclaw": {
        sell: true,
        sellPrice: "npc"
    },
    "computer": {
        hold: true,
        holdSlot: 40
    },
    "crabclaw": {
        sell: true,
        sellPrice: "npc"
    },
    "ringsj": {
        sell: true,
        sellPrice: "npc"
    },
    "hpamulet": {
        sell: true,
        sellPrice: "npc"
    },
    "hpbelt": {
        sell: true,
        sellPrice: "npc"
    },
    "hpot1": {
        hold: true,
        holdSlot: 39,
        replenish: 1000
    },
    "mpot1": {
        hold: true,
        holdSlot: 38,
        replenish: 1000
    },
    "tracker": {
        hold: true,
        holdSlot: 41
    },
    "wcap": {
        sell: true,
        sellPrice: "npc"
    },
    "wshoes": {
        sell: true,
        sellPrice: "npc"
    }
}

// ============== STRATEGIES ==============

const CONTEXTS: Strategist<PingCompensatedCharacter>[] = []

// Find party leader
const PARTY_LEADER = CHARACTERS.find(c => c.enabled && c.isPartyLeader)?.name || CHARACTERS.find(c => c.enabled)?.name

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
const moveStrategy = new ImprovedMoveStrategy("crab")
const attackStrategies: { [T in Exclude<CharacterType, "merchant">]: BaseAttackStrategy<PingCompensatedCharacter> } = {
    mage: new MageAttackStrategy({ contexts: CONTEXTS, type: "crab" }),
    paladin: new PaladinAttackStrategy({ contexts: CONTEXTS, type: "crab" }),
    priest: new PriestAttackStrategy({ contexts: CONTEXTS, disableCurse: true, type: "crab" }),
    ranger: new RangerAttackStrategy({ contexts: CONTEXTS, disableHuntersMark: true, type: "crab" }),
    rogue: new RogueAttackStrategy({ contexts: CONTEXTS, type: "crab" }),
    warrior: new WarriorAttackStrategy({ contexts: CONTEXTS, disableAgitate: true, type: "crab" })
}
const partyHealStrategy = new PartyHealStrategy(CONTEXTS)
const partyRequestStrategy = new RequestPartyStrategy(PARTY_LEADER)
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
    // Remove old strategies that aren't in the list
    for (const strategy of currentSetups.get(context) ?? []) {
        if (strategies.includes(strategy)) continue
        context.removeStrategy(strategy)
    }

    // Add strategies that aren't applied yet
    for (const strategy of strategies) {
        if (context.hasStrategy(strategy)) continue
        context.applyStrategy(strategy)
    }

    // Save strategy list
    currentSetups.set(context, strategies)
}

const contextsLogic = async () => {
    try {
        for (const context of CONTEXTS) {
            if (!context.isReady() || !context.bot.ready || context.bot.rip) {
                continue
            }

            // Holiday Spirit
            if (context.bot.S.holidayseason && !context.bot.s.holidayspirit) {
                swapStrategies(context, [getHolidaySpiritStrategy])
                continue
            }

            // Full of items
            if (context.bot.esize <= 0) {
                swapStrategies(context, [bankStrategy])
                continue
            }

            // Need replenishables
            for (const [item, numHold] of REPLENISHABLES) {
                const numHas = context.bot.countItem(item, context.bot.items)
                if (numHas > (numHold / 4)) continue
                const numWant = numHold - numHas
                if (!context.bot.canBuy(item, { ignoreLocation: true, quantity: numWant })) continue

                swapStrategies(context, [getReplenishablesStrategy])
                continue
            }

            // Farm
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
    context.applyStrategy(partyRequestStrategy)
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
    accountKey: keyof typeof ACCOUNTS,
    name: string,
    type: CharacterType,
    attemptNum = 0
) => {
    const credentials = ACCOUNTS[accountKey]

    // Remove stopped contexts
    for (let i = 0; i < CONTEXTS.length; i++) {
        const context = CONTEXTS[i]
        if (context.isStopped() && context.bot.name) {
            await stopCharacter(context.bot.name)
            i -= 1
        }
    }

    // Checks
    if (CONTEXTS.length >= MAX_CHARS) throw `Too many characters are already running (We only support ${MAX_CHARS} characters)`
    for (const context of CONTEXTS) {
        if (context.bot.name == name) throw `Character '${name}' is already running!`
    }

    let bot: PingCompensatedCharacter
    try {
        switch (type) {
            case "mage": {
                bot = new AL.Mage(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
                break
            }
            case "paladin": {
                bot = new AL.Paladin(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
                break
            }
            case "priest": {
                bot = new AL.Priest(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
                break
            }
            case "ranger": {
                bot = new AL.Ranger(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
                break
            }
            case "rogue": {
                bot = new AL.Rogue(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
                break
            }
            case "warrior": {
                bot = new AL.Warrior(credentials.userID, credentials.userAuth, name, AL.Game.G, AL.Game.servers[SERVER_REGION][SERVER_IDENTIFIER])
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
            setTimeout(startCharacter, 1_000, accountKey, name, type, attemptNum)
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
    }

    console.log(`[START] Started character: ${name} (${type}) on account ${accountKey}`)
}

// ============== MAIN ==============

async function main() {
    // Print startup banner
    console.log("")
    console.log("╔═══════════════════════════════════════════════════════════╗")
    console.log("║         Crabrave Local - Multi-Account Bot                ║")
    console.log("╚═══════════════════════════════════════════════════════════╝")
    console.log("")

    // Check if credentials are still placeholders
    const missingCredentials: string[] = []
    for (const [accountName, creds] of Object.entries(ACCOUNTS)) {
        if (creds.userID.includes("YOUR_") || creds.userAuth.includes("YOUR_")) {
            missingCredentials.push(accountName)
        }
    }

    if (missingCredentials.length > 0) {
        console.log("⚠️  WARNING: Missing credentials for account(s):", missingCredentials.join(", "))
        console.log("")
        console.log("┌───────────────────────────────────────────────────────────┐")
        console.log("│  HOW TO GET YOUR CREDENTIALS                              │")
        console.log("├───────────────────────────────────────────────────────────┤")
        console.log("│  1. Log into Adventure Land with the account              │")
        console.log("│  2. Open code editor in-game (press 'J')                  │")
        console.log("│  3. Run this code:                                        │")
        console.log("│     console.log('user_id:', parent.user_id)               │")
        console.log("│     console.log('user_auth:', parent.user_auth)           │")
        console.log("│  4. Open browser console (F12)                            │")
        console.log("│  5. Copy the values                                       │")
        console.log("│  6. Paste into ACCOUNTS section in this file              │")
        console.log("└───────────────────────────────────────────────────────────┘")
        console.log("")
        console.log("Edit: source/crabrave/crabrave_local.ts")
        console.log("")
        return // Don't start without credentials
    }

    console.log("Loading game data...")
    await Promise.all([AL.Game.loginJSONFile("../../credentials.json"), AL.Game.getGData(true)])
    await AL.Pathfinder.prepare(AL.Game.G, { cheat: true })
    console.log("Game data loaded!\n")

    // Filter enabled characters
    const enabledChars = CHARACTERS.filter(c => c.enabled)
    const disabledChars = CHARACTERS.filter(c => !c.enabled)

    console.log("┌─────────────────────────────────────────────────────────────┐")
    console.log("│  CHARACTER CONFIGURATION                                    │")
    console.log("├─────────────────────────────────────────────────────────────┤")
    console.log(`│  Enabled:  ${enabledChars.length} character(s)                                        │`)
    if (disabledChars.length > 0) {
        console.log(`│  Disabled: ${disabledChars.length} character(s)                                       │`)
        console.log("├─────────────────────────────────────────────────────────────┤")
        console.log("│  Disabled characters:                                       │")
        for (const char of disabledChars) {
            const line = `│    - ${char.name} (${char.type}) on ${char.account}`
            console.log(line.padEnd(60, " ") + "│")
        }
    }
    console.log("└─────────────────────────────────────────────────────────────┘")
    console.log("")

    // Determine party leader
    const partyLeader = enabledChars.find(c => c.isPartyLeader) || enabledChars[0]
    if (partyLeader) {
        console.log(`Party leader: ${partyLeader.name}`)
    }
    console.log("")

    // Start enabled characters
    console.log("Starting characters...")
    console.log("")
    for (const char of enabledChars) {
        try {
            await startCharacter(char.account, char.name, char.type)
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
