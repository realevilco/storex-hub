import { join } from 'path';
import cryptoRandomString from 'crypto-random-string'
import { StorageBackend } from "@worldbrain/storex";
import { DexieStorageBackend } from '@worldbrain/storex-backend-dexie'
import inMemory from '@worldbrain/storex-backend-dexie/lib/in-memory'
import { TypeORMStorageBackend } from "@worldbrain/storex-backend-typeorm";
import { Application, ApplicationOptions } from "./application";
import { BcryptAccessTokenManager } from "./access-tokens";
import { createHttpServer } from "./server";
import { PluginManager } from './plugins/manager';
import { discoverInstalledPlugins } from './plugins/discovery/main';

export async function main() {
    const application = await setupApplication()
    await maybeRunPluginDiscovery(application)
    await startServer(application)
    await loadPlugins(application)
}

export async function setupApplication() {
    const application = new Application(getApplicationDependencies({
        dbFilePath: process.env.DB_PATH,
    }))
    await application.setup()
    return application
}

async function maybeRunPluginDiscovery(application: Application) {
    if (!process.env.STOREX_HUB_DISCOVER_PLUGINS) {
        return
    }

    const patternOrTrue = process.env.STOREX_HUB_DISCOVER_PLUGINS
    if (patternOrTrue.toLowerCase() === 'false') {
        return
    }

    await discoverInstalledPlugins(application, {
        nodeModulesPath: join(process.cwd(), 'node_modules'),
        pluginDirGlob: patternOrTrue.toLowerCase() !== 'true' ? patternOrTrue : undefined
    })

    // TODO: Don't know why yet, but added plugins do not immediately get stored
    await new Promise(resolve => setTimeout(resolve, 1000))
}

async function loadPlugins(application: Application) {
    const storage = await application.storage
    const pluginManager = new PluginManager({
        pluginManagementStorage: storage.systemModules.plugins,
    })
    await pluginManager.setup(() => application.api())
}

export async function startServer(application: Application) {
    const server = await createHttpServer(application, {
        secretKey: 'very secret key'
    })

    const port = getPortNumber()
    await server.start({ port })
    console.log(`Server started at http://localhost:${port}`)
    return server
}

function getPortNumber(): number {
    const fromEnv = process.env.STOREX_HUB_PORT
    if (fromEnv) {
        const port = parseInt(fromEnv)
        if (!port) {
            console.error(`Invalid STOREX_HUB_PORT environment variable: ${fromEnv}`)
            process.exit(1)
        }
        return port
    }

    return process.env.NODE_ENV === 'production' ? 50482 : 50483
}

function getApplicationDependencies(options: { dbFilePath?: string }) {
    let applicationDependencies: ApplicationOptions
    const accessTokenManager = new BcryptAccessTokenManager({
        tokenGenerator: async () => cryptoRandomString({ length: 24, type: 'base64' })
    })

    let storageBackendsCreated = 0
    if (options.dbFilePath) {
        const createStorageBackend = () => new TypeORMStorageBackend({
            connectionOptions: {
                type: 'sqlite',
                database: options.dbFilePath,
                name: `connection-${++storageBackendsCreated}`,
            } as any,
        })
        const closeStorageBackend = async (storageBackend: StorageBackend) => {
            await (storageBackend as TypeORMStorageBackend).connection?.close?.()
        }

        applicationDependencies = {
            accessTokenManager,
            createStorageBackend,
            closeStorageBackend,
        }
    } else {
        try {
            // Dexie checks this even if it doesn't exist...
            global['navigator'] = { userAgent: 'memory' }
        } catch (e) {
            // ...but we don't care if it fails
        }

        const idbImplementation = inMemory()
        const createStorageBackend = () => new DexieStorageBackend({ dbName: 'test', idbImplementation })
        const closeStorageBackend = async (storageBackend: StorageBackend) => {
            await (storageBackend as DexieStorageBackend).dexieInstance.close()
        }
        applicationDependencies = {
            accessTokenManager,
            createStorageBackend,
            closeStorageBackend,
        }
    }

    return applicationDependencies
}

if (require.main === module) {
    main()
}

// curl -c cookies.txt -b cookies.txt 'http://localhost:3000/app/register' -H 'content-type: application/json' -d '{"name": "test", "identify": true}' ; echo
// curl -b cookies.txt 'http://localhost:3000/remote/operation' -H 'content-type: application/json' -d '{"app": "memex", "operation": ["findObjects", "tags", {}]}' ; echo

