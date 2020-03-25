import * as api from "./public-api";
import TypedEmitter from 'typed-emitter'
import { AccessTokenManager } from "./access-tokens";
import { Storage } from "./storage/types";
import { AppSchema } from "./types/apps";
import { EventEmitter } from "events";
import { StorexHubCallbacks_v0, AllStorexHubCallbacks_v0 } from "./public-api";
import { SingleArgumentOf, UnwrapPromise } from "./types/utils";

export interface SessionOptions {
    accessTokenManager: AccessTokenManager
    getStorage: () => Promise<Storage>
    updateStorage: () => Promise<void>

    // executeCallback: <MethodName extends keyof StorexHubCallbacks_v0>(
    //     (appIdentifier: string, methodName: MethodName, methodOptions: StorexHubCallbacks_v0[MethodName])
    //         => Promise<api.ExecuteRemoteOperationResult_v0>
    // )
    subscribeToEvent: (options: api.SubscribeToEventOptions_v0) => Promise<api.SubscribeToEventResult_v0>
    unsubscribeFromEvent: (options: api.UnsubscribeFromEventOptions_v0) => Promise<api.UnsubscribeFromEventResult_v0>
    emitEvent: (options: api.EmitEventOptions_v0) => Promise<api.EmitEventResult_v0>

    destroySession: () => Promise<void>

    executeCallback: (
        <MethodName extends keyof AllStorexHubCallbacks_v0>
            (appIdentifier: string, methodName: MethodName, methodOptions: SingleArgumentOf<AllStorexHubCallbacks_v0[MethodName]>)
            => Promise<
                { status: 'success', result: UnwrapPromise<ReturnType<AllStorexHubCallbacks_v0[MethodName]>> } |
                { status: 'app-not-found' }
            >
    )
}
export interface SessionEvents {
    appIdentified: (event: { identifier: string, remote: boolean }) => void
}

interface IdentifiedApp {
    id: number | string
    identifier: string
}
export class Session implements api.StorexHubApi_v0 {
    events: TypedEmitter<SessionEvents> = new EventEmitter() as TypedEmitter<SessionEvents>
    identifiedApp?: IdentifiedApp
    destroyed = false

    constructor(private options: SessionOptions) {
    }

    async registerApp(options: api.RegisterAppOptions_v0): Promise<api.RegisterAppResult_v0> {
        const storage = await this.options.getStorage()
        const existingApp = await storage.systemModules.apps.getApp(options.name)
        if (existingApp) {
            return { status: 'app-already-exists' }
        }

        const accessToken = await this.options.accessTokenManager.createToken()
        await storage.systemModules.apps.createApp({
            identifier: options.name,
            accessKeyHash: accessToken.hashedToken,
            isRemote: options.remote,
        })
        if (options.identify) {
            await this.identifyApp({ name: options.name, accessToken: accessToken.plainTextToken })
        }
        return { status: 'success', accessToken: accessToken.plainTextToken }
    }

    async identifyApp(options: api.IdentifyAppOptions_v0): Promise<api.IdentifyAppResult_v0> {
        const storage = await this.options.getStorage()
        const existingApp = await storage.systemModules.apps.getApp(options.name)
        if (!existingApp) {
            return { status: 'invalid-access-token' }
        }
        const valid = await this.options.accessTokenManager.validateToken({ actualHash: existingApp.accessKeyHash, providedToken: options.accessToken })
        if (!valid) {
            return { status: 'invalid-access-token' }
        }

        this.identifiedApp = { identifier: options.name, id: existingApp.id }
        this.events.emit('appIdentified', { identifier: options.name, remote: !!existingApp.isRemote })
        return { status: 'success' }
    }

    async getSessionInfo(): Promise<api.GetSessionInfoResult_v0> {
        return {
            status: 'success',
            appIdentifier: this.identifiedApp && this.identifiedApp.identifier,
        }
    }

    async executeOperation(options: { operation: any[] }): Promise<{ result: any }> {
        return { result: await (await this.options.getStorage()).manager.operation(options.operation[0], ...options.operation.slice(1)) }
    }

    async updateSchema(options: { schema: AppSchema }): Promise<api.UpdateSchemaResult_v0> {
        if (!this.identifiedApp) {
            return {
                success: false, errorCode: api.UpdateSchemaError_v0.NOT_ALLOWED,
                errorText: `Could not update schema: app not identified`
            }
        }

        const checkResult = await checkAppSchema(options.schema, { identifiedApp: this.identifiedApp })
        if (!checkResult.success) {
            return checkResult
        }

        await (await this.options.getStorage()).systemModules.apps.updateSchema(
            this.identifiedApp.id, options.schema,
        )
        await this.options.updateStorage()
        return { success: true }
    }

    async executeRemoteOperation(options: api.ExecuteRemoteOperationOptions_v0): Promise<api.ExecuteRemoteOperationResult_v0> {
        if (!this.identifiedApp) {
            return { status: 'not-identified' }
        }

        const response = await this.options.executeCallback(options.app, 'handleRemoteOperation', {
            sourceApp: this.identifiedApp.identifier,
            operation: options.operation,
        })
        if (response.status === 'success') {
            return {
                status: 'success',
                result: response.result.result
            }
        }
        return response
    }

    async subscribeToEvent(options: api.SubscribeToEventOptions_v0): Promise<api.SubscribeToEventResult_v0> {
        return this.options.subscribeToEvent(options)
    }

    async unsubscribeFromEvent(options: api.UnsubscribeFromEventOptions_v0): Promise<api.UnsubscribeFromEventResult_v0> {
        return this.options.unsubscribeFromEvent(options)
    }

    async emitEvent(options: api.EmitEventOptions_v0): Promise<api.EmitEventResult_v0> {
        return this.options.emitEvent(options)
    }

    async destroySession() {
        if (!this.destroyed) {
            await this.options.destroySession()
            this.destroyed = true
        }
    }
}

export async function checkAppSchema(schema: AppSchema, options: { identifiedApp: IdentifiedApp }): Promise<api.UpdateSchemaResult_v0> {
    for (const [collectionName] of Object.entries(schema.collectionDefinitions || {})) {
        const collectionNameMatch = /^([a-zA-Z]+)(?:\:([a-zA-Z]+))?$/.exec(collectionName)
        if (!collectionNameMatch) {
            return {
                success: false, errorCode: api.UpdateSchemaError_v0.BAD_REQUEST,
                errorText: `Cannot create collection with invalid name '${collectionName}'`
            }
        }

        if (!collectionNameMatch[2]) {
            return {
                success: false, errorCode: api.UpdateSchemaError_v0.SCHEMA_NOT_ALLOWED,
                errorText: `Cannot create non-namespaced collection '${collectionName}'`
            }
        }

        if (collectionNameMatch[1] !== options.identifiedApp.identifier) {
            return {
                success: false, errorCode: api.UpdateSchemaError_v0.SCHEMA_NOT_ALLOWED,
                errorText: `Cannot created collection '${collectionNameMatch[2]}' in app namespace '${collectionNameMatch[1]}'`
            }
        }
    }
    return { success: true }
}
