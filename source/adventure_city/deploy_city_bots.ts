import AL, { CharacterType, ItemName, Mage, Merchant, Paladin, PingCompensatedCharacter, Priest, Ranger, Rogue, ServerIdentifier, ServerRegion, Warrior } from "alclient"
import { Strategist, Strategy } from "../strategy_pattern/context.js"
import { ItemConfig } from "../base/itemsNew.js"
import { DEFAULT_IDENTIFIER, DEFAULT_REGION } from "../base/defaults.js"
import { getItemsToCompoundOrUpgrade } from "../base/items.js"

import { AccountConfig, BotRecord, DeploymentState, MerchantRecord } from "./config/types.js"
import { createDefaultDeployment, DEFAULT_ITEM_CONFIG, DEFAULT_REPLENISHABLES, MERCHANT_GOLD_TO_HOLD } from "./config/deployment.js"
import { loadAccountConfigs } from "./utils/config_loader.js"
import { buildBotRegistry, getCombatBots, getMerchantBots } from "./core/bot_registry.js"
import { buildPartyManager, updatePartyContexts, getPartyLeaderName } from "./core/party_manager.js"
import { buildHuntManager, updateHuntContexts } from "./core/hunt_manager.js"
import { buildMerchantManager, updateMerchantContexts, getFighterContextsForMerchant } from "./core/merchant_manager.js"
import { SharedStrategies, createSharedStrategies, swapStrategies, applySharedStrategies, determineBotState, getFarmingStrategies } from "./systems/strategy_applier.js"
import { checkXPRotation, initXPRotator } from "./systems/xp_rotator.js"

import path from "path"
import { fileURLToPath } from "url"

// ============================================================================
// INITIALIZE GAME DATA
// ============================================================================

AL.Game.setServer("http://127.0.0.1:8090")
await Promise.all([AL.Game.loginJSONFile("../../credentials.json", false), AL.Game.getGData(true)])
await AL.Pathfinder.prepare(AL.Game.G, { cheat: false })

// ============================================================================
// CONFIGURATION
// ============================================================================

const ACCOUNTS_FOLDER = "accounts"
const ITEM_CONFIG: ItemConfig = {
    // Sell useless items
    "cclaw": { sell: true, sellPrice: "npc" as const },
    "hpamulet": { sell: true, sellPrice: "npc" as const },
    "hpbelt": { sell: true, sellPrice: "npc" as const },
    "stinger": { sell: true, sellPrice: "npc" as const },
    
    // Buy and upgrade basic armor for all party members
    "wcap": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 8, useScroll1FromLevel: 1, useScroll2FromLevel: 6 },
    "wshoes": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 8, useScroll1FromLevel: 1, useScroll2FromLevel: 6 },
    "ringsj": { sell: true, buyPrice: "ponty" as const, upgradeUntilLevel: 4 },
    "sshield": { buy: true, buyPrice: "ponty" as const, useScroll1FromLevel: 1, useScroll2FromLevel: 6, upgradeUntilLevel: 8 },
    
    // Basic armor pieces for buy-and-upgrade system
    "helmet": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7},
    "coat": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7},
    "pants": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7},
    "shoes": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7},
    "gloves": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7},
    
    // Weapons by class (merchant will buy and upgrade these)
    "claw": { buy: true, buyPrice: "ponty" as const, upgradeUntilLevel: 7 },
    
    // Consumables
    "elixirluck": { hold: true, holdSlot: 37, replenish: 4 },
    "hpot1": { hold: true, holdSlot: 39, replenish: 2000 },
    "mpot1": { hold: true, holdSlot: 38, replenish: 2000 },
    "computer": { hold: true, holdSlot: 40 },
    "tracker": { hold: true, holdSlot: 41 },
    
    // Upgrade materials
}
const REPLENISHABLES = new Map<ItemName, number>(DEFAULT_REPLENISHABLES)
const MERCHANT_GOLD = MERCHANT_GOLD_TO_HOLD

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const accountsPath = path.resolve(__dirname, "..", "..", ACCOUNTS_FOLDER)

// ============================================================================
// GLOBAL STATE
// ============================================================================

const ALL_CONTEXTS: Strategist<PingCompensatedCharacter>[] = []

let sharedStrategies: SharedStrategies
let state: DeploymentState

// Merchant upgrade tracking
const merchantUpgradeState = new Map<string, {
    lastUpgradeCheck: number
    lastDeliverUpgradesCheck: number
    upgradeCycleActive: boolean
}>()

// ============================================================================
// GLOBAL ERROR HANDLING
// ============================================================================

function setupGlobalErrorHandling(): void {
    // Catch unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
        const error = reason instanceof Error ? reason.message : String(reason)
        // Suppress known benign errors
        if (error.includes("move to") || error.includes("respawn timeout") || error.includes("failed")) {
            return // Silently ignore expected operational errors
        }
        console.error("[UNHANDLED REJECTION]", reason)
    })

    // Catch uncaught exceptions
    process.on("uncaughtException", (error) => {
        const errorMessage = error.message || String(error)
        // Suppress known benign errors  
        if (errorMessage.includes("move to") || errorMessage.includes("respawn timeout") || errorMessage.includes("failed")) {
            return // Silently ignore expected operational errors
        }
        console.error("[UNCAUGHT EXCEPTION]", error)
    })

    // Suppress console.error calls for known errors (last resort)
    const originalConsoleError = console.error
    console.error = function(...args: any[]) {
        const errorMsg = args.join(" ")
        if (errorMsg.includes("move to") && errorMsg.includes("failed")) {
            return // Suppress move errors
        }
        if (errorMsg.includes("respawn timeout")) {
            return // Suppress respawn timeout errors
        }
        originalConsoleError.apply(console, args)
    }
}

// ============================================================================
// CHARACTER STARTUP
// ============================================================================

async function startCharacter(bot: BotRecord, attemptNum = 0): Promise<void> {
    const party = bot.partyId ? state.parties.parties.get(bot.partyId) : null
    const serverRegion = party?.server.region ?? DEFAULT_REGION as ServerRegion
    const serverId = party?.server.identifier ?? DEFAULT_IDENTIFIER as ServerIdentifier
    const serverData = AL.Game.servers[serverRegion]?.[serverId]

    if (!serverData) {
        throw new Error(`Server data not found for ${serverRegion}/${serverId}`)
    }

    let character: PingCompensatedCharacter
    switch (bot.type) {
        case "mage":
            character = new AL.Mage(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "paladin":
            character = new AL.Paladin(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "priest":
            character = new AL.Priest(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "ranger":
            character = new AL.Ranger(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "rogue":
            character = new AL.Rogue(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "warrior":
            character = new AL.Warrior(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        case "merchant":
            character = new AL.Merchant(bot.credentials.userID, bot.credentials.userAuth, bot.characterId, AL.Game.G, serverData)
            break
        default:
            throw new Error(`Unsupported character type: ${bot.type}`)
    }

    try {
        await character.connect()
    } catch (e) {
        character.disconnect()
        const errorMsg = String(e)
        // Suppress known connection errors
        if (!errorMsg.includes("nouser")) {
            console.warn(`[WARN] Connection issue for ${bot.name} (attempt ${attemptNum + 1}/3):`, errorMsg.split('\n')[0])
        }
        if (/nouser/.test(errorMsg)) {
            throw new Error(`Authorization failed for ${bot.name}!`)
        }
        if (attemptNum < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            return startCharacter(bot, attemptNum + 1)
        }
        throw new Error(`Failed starting ${bot.name}!`)
    }

    if (bot.type === "merchant") {
        console.log(`[MERCHANT] Checking items for upgrade (will scan after merchant is fully initialized)...`)
        // Don't scan immediately - bank data may not be available yet
        // The merchant strategy will handle this in processUpgradeCycle
    }

    let context: Strategist<PingCompensatedCharacter>
    switch (bot.type) {
        case "mage":
            context = new Strategist<Mage>(character as Mage, sharedStrategies.base)
            break
        case "paladin":
            context = new Strategist<Paladin>(character as Paladin, sharedStrategies.base)
            break
        case "priest":
            context = new Strategist<Priest>(character as Priest, sharedStrategies.base)
            break
        case "ranger":
            context = new Strategist<Ranger>(character as Ranger, sharedStrategies.base)
            break
        case "rogue":
            context = new Strategist<Rogue>(character as Rogue, sharedStrategies.base)
            break
        case "warrior":
            context = new Strategist<Warrior>(character as Warrior, sharedStrategies.base)
            break
        case "merchant":
            context = new Strategist<Merchant>(character as Merchant, sharedStrategies.base)
            break
        default:
            context = new Strategist<PingCompensatedCharacter>(character, sharedStrategies.base)
            break
    }

    bot.context = context
    bot.state = "ready"
    ALL_CONTEXTS.push(context)

    // Add context to the hunt's contexts array immediately, before applySharedStrategies
    // This is critical: TimeDistributor is created in onApply and reads contexts at that moment
    if (bot.huntGroupId) {
        const hunt = state.hunts.hunts.get(bot.huntGroupId)
        if (hunt && !hunt.contexts.includes(context)) {
            hunt.contexts.push(context)
        }
    }

    const partyId = bot.partyId
    let partyLeaderName: string | null = null
    if (partyId) {
        partyLeaderName = getPartyLeaderName(state.parties, state.registry, partyId)
    }

    if (bot.type === "merchant") {
        await startMerchant(context as Strategist<Merchant>, bot)
    } else {
        applySharedStrategies(context, bot.name, partyLeaderName, sharedStrategies, bot.huntGroupId)
    }

    console.log(`[START] Started ${bot.name} (${bot.type})`)
}

async function startMerchant(context: Strategist<Merchant>, bot: BotRecord): Promise<void> {
    context.applyStrategy(sharedStrategies.sell)

    const fighterContexts: Strategist<PingCompensatedCharacter>[] = []
    for (const [merchantId, merchant] of state.merchants.merchants) {
        if (merchant.botId === bot.botId) {
            for (const partyId of merchant.servedPartyIds) {
                const party = state.parties.parties.get(partyId)
                if (party) {
                    fighterContexts.push(...party.contexts)
                }
            }
        }
    }

    const uniqueContexts = Array.from(new Set(fighterContexts))

    console.log(`[MERCHANT] Starting merchant ${bot.name}`)
    console.log(`[MERCHANT] Total fighter contexts: ${uniqueContexts.length}`)
    for (const ctx of uniqueContexts) {
        console.log(`[MERCHANT]   - ${ctx.bot.name} (${ctx.bot.ctype})`)
    }

    const fighterItemStrategy = new (await import("../strategy_pattern/strategies/item.js")).ItemStrategy<PingCompensatedCharacter>({
        contexts: uniqueContexts,
        itemConfig: ITEM_CONFIG,
        transferItemsTo: bot.name,
    })

    const merchantItemStrategy = new (await import("../strategy_pattern/strategies/item.js")).ItemStrategy<PingCompensatedCharacter>({
        contexts: uniqueContexts,
        itemConfig: ITEM_CONFIG,
    })
    
    // Buy strategy - purchase items from other players/merchants
    const buyStrategy = new (await import("../strategy_pattern/strategies/buy.js")).BuyStrategy<PingCompensatedCharacter>({
        contexts: uniqueContexts,
        itemConfig: ITEM_CONFIG,
        enableBuyForProfit: true, // Buy from merchants to resell if profitable
    })

    for (const ctx of uniqueContexts) {
        if (ctx.bot.ctype !== "merchant") {
            ctx.applyStrategy(fighterItemStrategy)
        }
    }

    const { startMerchant: startMerchantStrategy, defaultNewMerchantStrategyOptions } = await import("../merchant/strategy.js")

    const merchantOptions = {
        ...defaultNewMerchantStrategyOptions,
        contexts: uniqueContexts,
        debug: true as const,
        defaultPosition: { map: "main" as const, x: 0, y: 0 },
        goldToHold: MERCHANT_GOLD,
        itemConfig: ITEM_CONFIG,
        enableMluck: { contexts: true as const, others: true as const, self: true as const, travel: true as const },
        // Enable buy and upgrade for basic equipment
        enableBuyAndUpgrade: {
            upgradeToLevel: 8, // Upgrade equipment up to level 8
        },
        // Enable exchange for lost earrings and other exchangeable items
        enableExchange: {
            items: new Set<ItemName>(["lostearring", "monstertoken"]),
            lostEarring: 2,
        },
    }

    startMerchantStrategy(context, uniqueContexts, merchantOptions)
    context.applyStrategy(merchantItemStrategy)
    context.applyStrategy(buyStrategy) // Enable buying from other players/merchants

    console.log(`[START] Started merchant: ${bot.name}`)
}

// ============================================================================
// MERCHANT UPGRADE LOOP
// ============================================================================

async function processMerchantUpgrades(merchantRecord: MerchantRecord): Promise<void> {
    const bot = state.registry.bots.get(merchantRecord.botId)
    if (!bot || !bot.context || !bot.context.bot) return
    
    const merchant = bot.context.bot as Merchant
    if (!merchant.ready || merchant.rip || merchant.ctype !== "merchant") return
    
    // Get or create upgrade state
    let upgradeState = merchantUpgradeState.get(merchantRecord.id)
    if (!upgradeState) {
        upgradeState = {
            lastUpgradeCheck: 0,
            lastDeliverUpgradesCheck: 0,
            upgradeCycleActive: false,
        }
        merchantUpgradeState.set(merchantRecord.id, upgradeState)
    }
    
    try {
        // Get fighter contexts for this merchant
        const fighterContexts = getFighterContextsForMerchant(state.merchants, merchantRecord.id, state.registry)
        if (fighterContexts.length === 0) return
        
        // Import merchant strategy to access upgrade functions
        const { MerchantStrategy, DEFAULT_MERCHANT_MOVE_STRATEGY_OPTIONS } = await import("../merchant/strategy.js")
        
        // Create temporary merchant strategy to access protected methods
        const tempMerchantStrategy = new MerchantStrategy(fighterContexts, {
            ...DEFAULT_MERCHANT_MOVE_STRATEGY_OPTIONS,
            enableBuyAndUpgrade: {
                upgradeToLevel: 8, // Don't upgrade items beyond level 8
            },
            defaultPosition: { map: "main", x: 0, y: 0 },
            goldToHold: MERCHANT_GOLD,
            itemsToHold: new Set(Object.keys(ITEM_CONFIG).filter(k => ITEM_CONFIG[k as ItemName]?.hold) as ItemName[]),
        })
        
        // Process upgrade cycle - this handles buying and upgrading basic items
        const now = Date.now()
        
        // Check if we should run upgrade cycle (every 30 seconds)
        if (now - upgradeState.lastUpgradeCheck > 30000 && !upgradeState.upgradeCycleActive) {
            upgradeState.lastUpgradeCheck = now
            upgradeState.upgradeCycleActive = true
            
            try {
                console.log(`[MERCHANT-UPGRADE] ${merchant.name}: Starting upgrade cycle`)
                
                // Access protected method through type casting
                const processUpgradeCycle = (tempMerchantStrategy as any).processUpgradeCycle
                if (typeof processUpgradeCycle === 'function') {
                    await processUpgradeCycle.call(tempMerchantStrategy, merchant)
                }
                
                console.log(`[MERCHANT-UPGRADE] ${merchant.name}: Upgrade cycle complete`)
            } catch (e) {
                console.error(`[MERCHANT-UPGRADE] ${merchant.name}: Error in upgrade cycle:`, e)
            } finally {
                upgradeState.upgradeCycleActive = false
            }
        }
        
        // Deliver upgraded items to party members (every 15 seconds)
        if (now - upgradeState.lastDeliverUpgradesCheck > 15000) {
            upgradeState.lastDeliverUpgradesCheck = now
            
            try {
                console.log(`[MERCHANT-DELIVER] ${merchant.name}: Checking for items to deliver`)
                
                // Access protected method
                const goDeliverUpgrades = (tempMerchantStrategy as any).goDeliverUpgrades
                if (typeof goDeliverUpgrades === 'function') {
                    await goDeliverUpgrades.call(tempMerchantStrategy, merchant)
                }
            } catch (e) {
                console.error(`[MERCHANT-DELIVER] ${merchant.name}: Error delivering items:`, e)
            }
        }
    } catch (e) {
        console.error(`[MERCHANT] Error processing upgrades for ${merchantRecord.id}:`, e)
    }
}

// ============================================================================
// TIME DISTRIBUTOR RESET
// ============================================================================

function resetTimeDistributors(state: DeploymentState): void {
    for (const [huntId, hunt] of state.hunts.hunts) {
        for (const [, attackStrategy] of hunt.attackStrategies) {
            const strategy = attackStrategy as any
            if (strategy.sharedTimeDistributor) {
                strategy.sharedTimeDistributor = null
                strategy.botTimeDistributor?.clear()
            }
        }
    }

    // Re-apply attack strategies to all combat contexts to recreate TimeDistributors
    for (const [botId, bot] of state.registry.bots) {
        if (!bot.context || bot.type === "merchant") continue
        if (!bot.huntGroupId) continue

        const attackStrategy = state.hunts.hunts.get(bot.huntGroupId)?.attackStrategies.get(bot.type)
        if (attackStrategy) {
            bot.context.applyStrategy(attackStrategy)
        }
    }

    console.log(`[TIME-DIST] Reset and recreated TimeDistributors for all hunts`)
}

// ============================================================================
// MAIN LOGIC LOOP
// ============================================================================

function startLogicLoop(): void {
    for (const [huntId, hunt] of state.hunts.hunts) {
        initXPRotator(hunt)
    }

    const loop = async () => {
        try {
            updatePartyContexts(state.parties, state.registry)
            updateHuntContexts(state.hunts, state.registry, state.allCombatContexts)
            updateMerchantContexts(state.merchants, state.registry)

            for (const [botId, bot] of state.registry.bots) {
                try {
                    if (!bot.context) continue
                    if (!bot.context.isReady() || !bot.context.bot.ready || bot.context.bot.rip) {
                        continue
                    }

                    if (bot.context.bot.ctype === "merchant") {
                        continue
                    }

                    const huntId = bot.huntGroupId
                    const stateStrategies = determineBotState(bot.context, sharedStrategies, REPLENISHABLES, huntId)

                    if (stateStrategies) {
                        swapStrategies(bot.context, stateStrategies)
                        continue
                    }

                    const farmingStrategies = getFarmingStrategies(bot.context, huntId, state.hunts)
                    if (farmingStrategies.length > 0) {
                        swapStrategies(bot.context, farmingStrategies)
                    }
                } catch (botError) {
                    // Suppress errors for individual bots to keep the loop running
                    const errorMsg = String(botError)
                    if (!errorMsg.includes("move to") && !errorMsg.includes("respawn timeout")) {
                        console.error(`[BOT-ERROR] Error processing ${bot.name}:`, errorMsg.split('\n')[0])
                    }
                }
            }

            for (const [huntId, hunt] of state.hunts.hunts) {
                try {
                    checkXPRotation(hunt)
                } catch (xpError) {
                    console.error(`[XP-ERROR] Error in hunt ${huntId}:`, xpError)
                }
            }
            
            // Process merchant upgrades and deliveries
            for (const [merchantId, merchantRecord] of state.merchants.merchants) {
                if (!merchantRecord.enabled) continue
                await processMerchantUpgrades(merchantRecord).catch(e => {
                    console.error(`[MERCHANT] Error in upgrade loop for ${merchantId}:`, e)
                })
            }
        } catch (e) {
            const errorMsg = String(e)
            // Suppress known operational errors
            if (!errorMsg.includes("move to") && !errorMsg.includes("respawn timeout") && !errorMsg.includes("failed")) {
                console.error("[LOOP-ERROR]", e)
            }
        } finally {
            setTimeout(loop, 1000)
        }
    }

    loop().catch(console.error)
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    // Setup global error handling first
    setupGlobalErrorHandling()

    console.log("")
    console.log("╔═══════════════════════════════════════════════════════════╗")
    console.log("║         Adventure City - Multi-Party Bot System           ║")
    console.log("╚═══════════════════════════════════════════════════════════╝")
    console.log("")

    console.log("[CONFIG] Loading account configurations...")
    const accountConfigs = loadAccountConfigs(accountsPath)

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

    const deploymentConfig = createDefaultDeployment()

    console.log("[BUILD] Building bot registry...")
    const registry = buildBotRegistry(accountConfigs, deploymentConfig)

    console.log("[BUILD] Building party manager...")
    const parties = buildPartyManager(registry, deploymentConfig.parties)

    console.log("[BUILD] Building hunt manager...")
    const hunts = buildHuntManager(registry, deploymentConfig.hunts)

    console.log("[BUILD] Building merchant manager...")
    const merchants = buildMerchantManager(registry, deploymentConfig.merchants, deploymentConfig.parties)

    state = {
        registry,
        parties,
        hunts,
        merchants,
        allCombatContexts: [],
        allContexts: ALL_CONTEXTS,
    }

    console.log("")
    console.log("[BUILD] Creating shared strategies...")
    sharedStrategies = createSharedStrategies(hunts, ITEM_CONFIG, REPLENISHABLES)

    console.log("")
    console.log("┌─────────────────────────────────────────────────────────────┐")
    console.log("│  DEPLOYMENT SUMMARY                                         │")
    console.log("├─────────────────────────────────────────────────────────────┤")
    console.log(`│  Parties: ${deploymentConfig.parties.length.toString().padEnd(49)}│`)
    console.log(`│  Hunts: ${deploymentConfig.hunts.length.toString().padEnd(50)}│`)
    console.log(`│  Merchants: ${deploymentConfig.merchants.length.toString().padEnd(47)}│`)
    console.log(`│  Total bots: ${registry.bots.size.toString().padEnd(46)}│`)
    console.log("├─────────────────────────────────────────────────────────────┤")
    console.log("│  Characters to start:                                       │")
    for (const [botId, bot] of registry.bots) {
        const partyName = bot.partyId ? parties.parties.get(bot.partyId)?.name ?? "unknown" : "none"
        const huntName = bot.huntGroupId ? hunts.hunts.get(bot.huntGroupId)?.name ?? "unknown" : "none"
        const line = `│    - ${bot.name.padEnd(12)} (${bot.type.padEnd(10)}) p:${partyName.padEnd(10)} h:${huntName}`
        console.log(line.padEnd(60, " ") + "│")
    }
    console.log("└─────────────────────────────────────────────────────────────┘")
    console.log("")

    console.log("[STARTUP] Starting combat bots...")
    const combatBots = getCombatBots(registry)
    
    // Start combat bots in parallel batches to speed up deployment
    const BATCH_SIZE = 3 // Start 3 bots at a time to avoid overwhelming the server
    for (let i = 0; i < combatBots.length; i += BATCH_SIZE) {
        const batch = combatBots.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(combatBots.length / BATCH_SIZE)
        console.log(`[STARTUP] Starting batch ${batchNum}/${totalBatches} (${batch.length} bots)...`)
        
        const promises = batch.map(async (bot) => {
            try {
                await startCharacter(bot)
            } catch (e) {
                console.error(`[ERROR] Failed to start ${bot.name}:`, e)
            }
        })
        
        await Promise.allSettled(promises)
        
        // Small delay between batches to let connections stabilize
        if (i + BATCH_SIZE < combatBots.length) {
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }

    // After all combat bots are started, reset TimeDistributors so they
    // are recreated with the full set of contexts. Without this, the
    // TimeDistributor would have been created with only the first bot.
    resetTimeDistributors(state)

    console.log(`[STARTUP] Starting ${getMerchantBots(registry).length} merchant(s)...`)
    const merchantBots = getMerchantBots(registry)
    for (const bot of merchantBots) {
        try {
            await startCharacter(bot)
        } catch (e) {
            console.error(`[ERROR] Failed to start ${bot.name}:`, e)
        }
    }

    console.log("")
    console.log("[LOOP] Starting logic loop...")
    startLogicLoop()

    console.log("")
    console.log("═".repeat(60))
    console.log("All characters processed! Logic loop running.")
    console.log("═".repeat(60))
}

main().catch(console.error)
