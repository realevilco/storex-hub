import { main } from "../../main"
import tempy from "tempy"
import del from "del"
import path from "path"
import { copy } from "fs-extra"
import expect from "expect"

const TEST_PLUGIN_IDENTIFIER = 'io.worldbrain.storex-hub.test-plugin'

const listedPlugins = (status: string) => ({
    status: 'success',
    plugins: [
        expect.objectContaining({
            identifier: TEST_PLUGIN_IDENTIFIER
        })
    ],
    state: {
        [TEST_PLUGIN_IDENTIFIER]: {
            status
        }
    }
})

describe('Plugins', () => {
    it('should correctly list plugins and install listed plugins by identifier', async () => {
        const tmpDir = tempy.directory()
        const dbPath = path.join(tmpDir, 'db')
        const pluginDir = path.join(tmpDir, 'plugins')
        try {
            const { application } = await main({
                withoutServer: true,
                runtimeConfig: {
                    dbPath,
                    pluginsDir: pluginDir
                }
            })
            const location = path.join(__dirname, 'test-plugin')
            await copy(location, path.join(pluginDir, 'test-plugin'))
            const api = await application.api()
            expect(await api.listPlugins()).toEqual(listedPlugins('available'))
            const installResponse = await api.installPlugin({
                identifier: TEST_PLUGIN_IDENTIFIER
            })
            expect(installResponse).toEqual({ status: 'success' })
            expect(application.pluginManager.loadedPlugins).toEqual({
                [TEST_PLUGIN_IDENTIFIER]: expect.objectContaining({ running: true })
            })
            expect(await api.listPlugins()).toEqual(listedPlugins('enabled'))
        } finally {
            del(tmpDir, { force: true })
        }
    })

    it('should correctly install new plugins by filesystem location', async () => {
        const dbPath = tempy.directory()
        try {
            const { application } = await main({ withoutServer: true, runtimeConfig: { dbPath } })
            const api = await application.api()
            const location = path.join(__dirname, 'test-plugin')
            const installResponse = await api.installPlugin({ location })
            expect(installResponse).toEqual({ status: 'success' })
            expect(application.pluginManager.loadedPlugins).toEqual({
                [TEST_PLUGIN_IDENTIFIER]: expect.objectContaining({ running: true })
            })
            expect(await api.listPlugins()).toEqual(listedPlugins('enabled'))
        } finally {
            del(dbPath, { force: true })
        }
    })

    it('should correctly inspect an installed plugin', async () => {
        const tmpDir = tempy.directory()
        const dbPath = path.join(tmpDir, 'db')
        const pluginDir = path.join(tmpDir, 'plugins')
        try {
            const { application } = await main({
                withoutServer: true,
                runtimeConfig: {
                    dbPath,
                    pluginsDir: pluginDir
                }
            })
            const location = path.join(__dirname, 'test-plugin')
            await copy(location, path.join(pluginDir, 'test-plugin'))
            const api = await application.api()
            const installResponse = await api.installPlugin({
                identifier: TEST_PLUGIN_IDENTIFIER
            })
            expect(installResponse).toEqual({ status: 'success' })
            expect(application.pluginManager.loadedPlugins).toEqual({
                [TEST_PLUGIN_IDENTIFIER]: expect.objectContaining({ running: true })
            })
            expect(await api.inspectPlugin({ identifier: TEST_PLUGIN_IDENTIFIER })).toEqual({
                status: 'success',
                pluginInfo: expect.objectContaining({ identifier: TEST_PLUGIN_IDENTIFIER })
            })
        } finally {
            del(dbPath, { force: true })
        }
    })

    it('should correctly inspect an available plugin', async () => {
        const tmpDir = tempy.directory()
        const dbPath = path.join(tmpDir, 'db')
        const pluginDir = path.join(tmpDir, 'plugins')
        try {
            const { application } = await main({
                withoutServer: true,
                runtimeConfig: {
                    dbPath,
                    pluginsDir: pluginDir
                }
            })
            const location = path.join(__dirname, 'test-plugin')
            await copy(location, path.join(pluginDir, 'test-plugin'))
            const api = await application.api()
            expect(await api.inspectPlugin({ identifier: TEST_PLUGIN_IDENTIFIER })).toEqual({
                status: 'success',
                pluginInfo: expect.objectContaining({ identifier: TEST_PLUGIN_IDENTIFIER })
            })
        } finally {
            del(tmpDir, { force: true })
        }
    })
})
