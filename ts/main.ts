import * as fs from 'fs';
import * as path from 'path'
import cryptoRandomString from 'crypto-random-string'
import { StorageBackend } from "@worldbrain/storex";
import { DexieStorageBackend } from '@worldbrain/storex-backend-dexie'
import inMemory from '@worldbrain/storex-backend-dexie/lib/in-memory'
import { TypeORMStorageBackend } from "@worldbrain/storex-backend-typeorm";

import { Application, ApplicationOptions } from "./application";
import { BcryptAccessTokenManager } from "./access-tokens";
import { createHttpServer } from "./server";

export interface RuntimeConfig {
    dbPath?: string
    pluginsDir?: string
}

// We need this to be global, so we can run multiple tests with this increasing
let storageBackendsCreated = 0

export async function main(options?: {
    runtimeConfig?: RuntimeConfig,
    frontendDir?: string
    withoutServer?: boolean
}) {
    const runtimeConfig = options?.runtimeConfig ?? getRuntimeConfig()
    const application = await setupApplication(runtimeConfig)
    if (!options?.withoutServer) {
        let frontendDir = options?.frontendDir
        if (!frontendDir) {
            frontendDir = path.join(__dirname, '..', 'frontend', 'build')
        }
        await startServer(application, { frontendDir })
    }
    return { application }
}

export function getRuntimeConfig(): RuntimeConfig {
    return {
        dbPath: process.env.DB_PATH,
        pluginsDir: process.env.PLUGINS_DIR
    }
}

export async function setupApplication(runtimeConfig?: RuntimeConfig) {
    const application = new Application({
        pluginsDir: runtimeConfig?.pluginsDir,
        ...getApplicationDependencies({
            dbFilePath: runtimeConfig?.dbPath,
        })
    })
    await application.setup()
    return application
}

export async function startServer(application: Application, options: { frontendDir?: string }) {
    const server = await createHttpServer(application, {
        secretKey: 'very secret key',
        ...options,
    })

    const port = getPortNumber()
    await server.start({ port })
    console.log(`Server started at http://localhost:${port}`)
    console.log(`You can find the management UI at http://localhost:${port}/management/`)
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

function getDBFilePath(configured: string, appIdentifier: string) {
    if (!fs.existsSync(configured)) {
        fs.mkdirSync(configured)
    }

    const isDir = fs.statSync(configured).isDirectory()
    if (isDir) {
        return path.join(configured, `${appIdentifier}.sqlite3`)
    }
    if (appIdentifier === '_system') {
        return configured
    }

    return path.join(path.dirname(configured), `${appIdentifier}.sqlite3`)
}

export function getApplicationDependencies(options: { dbFilePath?: string }) {
    let applicationDependencies: ApplicationOptions
    const accessTokenManager = new BcryptAccessTokenManager({
        tokenGenerator: async () => cryptoRandomString({ length: 24, type: 'base64' })
    })

    if (options.dbFilePath) {
        applicationDependencies = {
            accessTokenManager,
            createStorageBackend: ({ appIdentifier }) => new TypeORMStorageBackend({
                connectionOptions: {
                    type: 'sqlite',
                    database: getDBFilePath(options.dbFilePath!, appIdentifier),
                    name: `connection-main-${++storageBackendsCreated}`,
                } as any,
            }),
            closeStorageBackend: async (storageBackend: StorageBackend) => {
                await (storageBackend as TypeORMStorageBackend).connection?.close?.()
            }
        }
    } else {
        try {
            // Dexie checks this even if it doesn't exist...
            global['navigator'] = { userAgent: 'memory' }
        } catch (e) {
            // ...but we don't care if it fails
        }

        const idbImplementations: { [appIdentifier: string]: ReturnType<typeof inMemory> } = {}
        applicationDependencies = {
            accessTokenManager,
            createStorageBackend: (backupOptions) => {
                if (!idbImplementations[backupOptions.appIdentifier]) {
                    idbImplementations[backupOptions.appIdentifier] = inMemory()
                }
                return new DexieStorageBackend({
                    dbName: backupOptions.appIdentifier, idbImplementation: idbImplementations[backupOptions.appIdentifier]
                })
            },
            closeStorageBackend: async (storageBackend: StorageBackend) => {
                // await (storageBackend as DexieStorageBackend).dexieInstance.close()
            },
        }
    }

    return applicationDependencies
}

if (require.main === module) {
    main()
}

// curl -c cookies.txt -b cookies.txt 'http://localhost:3000/app/register' -H 'content-type: application/json' -d '{"name": "test", "identify": true}' ; echo
// curl -b cookies.txt 'http://localhost:3000/remote/operation' -H 'content-type: application/json' -d '{"app": "memex", "operation": ["findObjects", "tags", {}]}' ; echo

