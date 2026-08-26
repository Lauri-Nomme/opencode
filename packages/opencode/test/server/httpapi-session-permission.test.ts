import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { Effect, Layer } from "effect"

import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Session } from "@/session/session"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const it = testEffect(Layer.mergeAll(LayerNode.compile(LayerNode.group([Session.node, Database.node])), httpApiLayer))

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const patchPermission = (sessionID: string, directory: string, permission: PermissionV1.Ruleset) =>
  requestInDirectory(SessionPaths.update.replace(":sessionID", sessionID), directory, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission }),
  })

describe("session.update permission", () => {
  it.instance(
    "replaces the permission ruleset instead of appending to it",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const svc = yield* Session.Service
        const created = yield* svc.create({})
        const sessionID = created.id

        const first: PermissionV1.Ruleset = [
          { permission: "bash", pattern: "*", action: "ask" },
          { permission: "read", pattern: "*", action: "allow" },
        ]
        const firstRes = yield* patchPermission(sessionID, test.directory, first)
        expect(firstRes.status).toBe(200)

        const replaced: PermissionV1.Ruleset = [{ permission: "*", pattern: "*", action: "allow" }]
        const secondRes = yield* patchPermission(sessionID, test.directory, replaced)
        expect(secondRes.status).toBe(200)

        const info = yield* svc.get(sessionID)
        expect(info.permission).toMatchObject(replaced)
      }),
    { git: true, config: { formatter: false, lsp: false } },
    { timeout: 30000 },
  )

  it.instance(
    "clears the permission ruleset when an empty array is provided",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const svc = yield* Session.Service
        const created = yield* svc.create({})
        const sessionID = created.id

        yield* patchPermission(sessionID, test.directory, [{ permission: "*", pattern: "*", action: "allow" }])

        const cleared: PermissionV1.Ruleset = []
        const res = yield* patchPermission(sessionID, test.directory, cleared)
        expect(res.status).toBe(200)

        const info = yield* svc.get(sessionID)
        expect(info.permission?.length ?? 0).toBe(0)
      }),
    { git: true, config: { formatter: false, lsp: false } },
    { timeout: 30000 },
  )
})