import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { AccountConfig, DeploymentConfig } from "../config/types.js"
import { validateDeployment } from "../config/deployment.js"

export function loadAccountConfigs(folderPath: string): AccountConfig[] {
    const accountsPath = path.resolve(folderPath)

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

export function loadDeploymentConfig(filePath: string): DeploymentConfig | null {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`[DEPLOY] Deployment config not found: ${filePath}`)
            return null
        }

        const content = fs.readFileSync(filePath, "utf-8")
        const config: DeploymentConfig = JSON.parse(content)

        const errors = validateDeployment(config)
        if (errors.length > 0) {
            console.error(`[DEPLOY] Validation errors in deployment config:`)
            for (const error of errors) {
                console.error(`  - ${error}`)
            }
            return null
        }

        console.log(`[DEPLOY] Loaded deployment config: ${config.parties.length} parties, ${config.hunts.length} hunts, ${config.merchants.length} merchants`)
        return config
    } catch (e) {
        console.error(`[DEPLOY] Error loading deployment config:`, e)
        return null
    }
}
