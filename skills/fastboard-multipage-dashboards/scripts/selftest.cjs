const assert = require("node:assert/strict");
const { validate } = require("./check-dashboard.cjs");
const { Client, decode, safe, isRead } = require("./mcp-client.cjs");
function fixture() {
  return {
    pagesSettings: [
      {
        page: {
          id: "page-a",
          boardSettings: { sizes: { width: 800, height: 700 } },
          variables: [{ id: "popup", type: "boolean", status: "false" }],
        },
        visualizationsV3: [
          {
            id: "kpi",
            pageId: "page-a",
            isVisible: true,
            visualisationType: "text",
            positionConfig: { x: 20, y: 20, width: 200, height: 80 },
            viewSettings: {
              name: "KPI",
              group: { isGrouped: false, groupId: null },
              text: { text: "{{val}}" },
              paddingSettings: {
                top: 16,
                right: 16,
                bottom: 16,
                left: 16,
                unsetPaddings: true,
              },
            },
            sqlData: { isFreeMode: false, filterAndGroupRequest: "" },
            dataSettings: {
              isRealData: true,
              modelId: "model-a",
              variables: [
                {
                  name: "val",
                  customRequest: "uniqExact(m.initiative_id)",
                  settings: {
                    textPropertiesSettings: {
                      text: { text: "value", isShow: true },
                    },
                  },
                },
              ],
            },
            events: {
              goTo: { isActive: false },
              transitionSettings: { isActive: false },
              variablesSettings: {
                isActive: false,
                control: { view: { isActive: false } },
                variables: [],
              },
            },
          },
        ],
        filtersV3: [],
        groupsVisualizationsV3: [],
        indeces: { pageId: "page-a", layers: ["kpi"] },
      },
    ],
  };
}
let tests = 0;
function test(name, fn) {
  fn();
  tests++;
  console.log("PASS " + name);
}
test("positive artifact", () =>
  assert.equal(validate(fixture()).status, "PASS"));
const mutations = [
  [
    "object_id",
    (d) =>
      d.pagesSettings[0].visualizationsV3.push(
        structuredClone(d.pagesSettings[0].visualizationsV3[0]),
      ),
  ],
  ["layer_missing", (d) => (d.pagesSettings[0].indeces.layers = [])],
  ["layer_duplicate", (d) => d.pagesSettings[0].indeces.layers.push("kpi")],
  [
    "receiver_variable",
    (d) =>
      (d.pagesSettings[0].visualizationsV3[0].events.variablesSettings.control.view =
        { isActive: true, variableId: "absent" }),
  ],
  [
    "dead_group",
    (d) =>
      (d.pagesSettings[0].visualizationsV3[0].viewSettings.group = {
        isGrouped: true,
        groupId: null,
      }),
  ],
  [
    "kpi_template",
    (d) =>
      (d.pagesSettings[0].visualizationsV3[0].dataSettings.variables[0].settings.textPropertiesSettings.text.text =
        ""),
  ],
  [
    "geometry",
    (d) => (d.pagesSettings[0].visualizationsV3[0].positionConfig.x = 799),
  ],
  [
    "navigation_conflict",
    (d) => {
      const e = d.pagesSettings[0].visualizationsV3[0].events;
      e.goTo = { isActive: true, to: { id: "page-a", type: "page" } };
      e.transitionSettings.isActive = true;
    },
  ],
  [
    "full_select",
    (d) =>
      (d.pagesSettings[0].visualizationsV3[0].sqlData.filterAndGroupRequest =
        "SELECT * FROM m"),
  ],
  [
    "initial_visibility",
    (d) =>
      (d.pagesSettings[0].visualizationsV3[0].events.variablesSettings.control.view =
        { isActive: true, variableId: "popup" }),
  ],
];
for (const [code, mutate] of mutations)
  test("reject " + code, () => {
    const d = fixture();
    mutate(d);
    assert.ok(validate(d).errors.some((e) => e.code === code));
  });
test("reject layers_missing", () => {
  const d = fixture();
  delete d.pagesSettings[0].indeces.layers;
  assert.ok(validate(d).errors.some((e) => e.code === "layers_missing"));
});

test("padding false warns and strict rejects", () => {
  const d = fixture();
  d.pagesSettings[0].visualizationsV3[0].viewSettings.paddingSettings.unsetPaddings = false;
  assert.ok(validate(d).warnings.some((e) => e.code === "padding_disabled"));
  assert.equal(validate(d, { strict: true }).status, "FAIL");
});
test("foreign model rejected", () =>
  assert.ok(
    validate(fixture(), { models: [{ id: "other" }] }).errors.some(
      (e) => e.code === "model",
    ),
  ));
test("bad palette rejected", () => {
  const d = fixture();
  d.pagesSettings[0].page.color = {
    color: {
      palette: { type: "color", groupId: "missing", colorId: "missing" },
    },
  };
  assert.ok(
    validate(d, { palettes: [{ id: "g", colors: [{ id: "c" }] }] }).errors.some(
      (e) => e.code === "palette_color",
    ),
  );
});
test("second page is validated", () => {
  const d = fixture();
  const p = structuredClone(d.pagesSettings[0]);
  p.page.id = "page-b";
  p.indeces.pageId = "page-b";
  p.visualizationsV3[0].id = "kpi-b";
  p.visualizationsV3[0].pageId = "page-b";
  p.indeces.layers = ["kpi-b"];
  p.visualizationsV3[0].dataSettings.variables[0].settings.textPropertiesSettings.text.text =
    "";
  d.pagesSettings.push(p);
  assert.ok(
    validate(d).errors.some(
      (e) => e.path.startsWith("pagesSettings.1") && e.code === "kpi_template",
    ),
  );
});
test("RPC JSON parser", () =>
  assert.deepEqual(decode('{"result":{"ok":true}}'), { result: { ok: true } }));
test("RPC SSE parser", () =>
  assert.deepEqual(decode('event: message\ndata: {"result":{"ok":true}}\n\n'), {
    result: { ok: true },
  }));
test("sanitize credentials", () => {
  const token = "fbpat_" + "samplecredentialneveruse";
  assert.equal(
    safe({ password: "no", info: token }, token).password,
    "[REDACTED]",
  );
  assert.equal(safe(token, token), "[REDACTED]");
});
test("sanitize serialized JSON credentials", () => {
  const out = safe(
    '{"nested":{"password":"sample-password"},"accessToken":"sample-access"}',
  );
  assert.ok(!out.includes("sample-password"));
  assert.ok(!out.includes("sample-access"));
});
test("sanitize HTTP error credential text", () => {
  const out = safe(
    'HTTP 401: {"accessToken":"sample-access","password":"sample-password"}',
  );
  assert.ok(!out.includes("sample-access"));
  assert.ok(!out.includes("sample-password"));
});
test("sanitize session headers and jwt fields", () => {
  const out = safe({
    "X-Auth-Token": "sample-session",
    jwt: "sample-jwt",
    note: "Authorization: Bearer sample-secret",
  });
  assert.equal(out["X-Auth-Token"], "[REDACTED]");
  assert.equal(out.jwt, "[REDACTED]");
  assert.ok(!out.note.includes("sample-secret"));
});
test("safe read classification", () => {
  assert.equal(isRead("get_project_pages"), true);
  assert.equal(isRead("save_project_pages"), false);
  assert.equal(isRead("data_catalog_ai_fill"), false);
  assert.equal(isRead("qa_send_message"), false);
});
async function asyncTests() {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          result: { content: [{ type: "text", text: "true" }] },
        }),
    };
  };
  const c = new Client({
    endpoint: "https://example.invalid/api/v3/mcp",
    token: "test-only",
    projectId: "project-a",
    fetchImpl,
  });
  await assert.rejects(() => c.call("save_project_pages", {}), /--write/);
  assert.equal(requests.length, 0);
  tests++;
  console.log("PASS write denied before network");
  await assert.rejects(
    () => c.call("get_project_pages", { projectId: "other" }),
    /does not match/,
  );
  assert.equal(requests.length, 0);
  tests++;
  console.log("PASS project mismatch denied before network");
  await c.call("save_project_pages", {}, true);
  assert.deepEqual(
    requests.map((r) => r.params.name),
    ["get_last_settings_timestamp", "save_project_pages"],
  );
  tests++;
  console.log("PASS timestamp before explicit write");
  console.log(
    JSON.stringify({
      status: "PASS",
      tests,
      network: "mock only; no server calls",
    }),
  );
}
asyncTests().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
