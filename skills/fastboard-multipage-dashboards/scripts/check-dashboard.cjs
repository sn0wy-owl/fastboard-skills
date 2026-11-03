const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function validate(document, options = {}) {
  const errors = [],
    warnings = [];
  const add = (code, where, message, warning = false) =>
    (warning ? warnings : errors).push({ code, path: where, message });
  const pages = document?.pagesSettings;
  if (!Array.isArray(pages) || !pages.length) {
    add(
      "no_pages",
      "pagesSettings",
      "Expected a nonempty pagesSettings export.",
    );
    return {
      status: "FAIL",
      errors,
      warnings,
      counts: { pages: 0, widgets: 0, filters: 0 },
    };
  }
  const modelsInput = options.models || document.models;
  const models = modelsInput
    ? new Set(
        (Array.isArray(modelsInput)
          ? modelsInput
          : modelsInput.models || []
        ).map((m) => m.id),
      )
    : null;
  const paletteInput = options.palettes;
  const palettes = new Set(),
    colors = new Set();
  if (paletteInput) {
    const containers = Array.isArray(paletteInput)
      ? paletteInput
      : paletteInput.projectPalette ||
        paletteInput.projectPalettes ||
        paletteInput.groups ||
        [];
    for (const item of containers) {
      for (const group of item.groups || [item]) {
        if (!group.id || !Array.isArray(group.colors)) continue;
        palettes.add(group.id);
        for (const color of group.colors) colors.add(group.id + "/" + color.id);
      }
    }
  }
  const globalIds = new Set(),
    pageIds = new Set();
  const counts = { pages: pages.length, widgets: 0, filters: 0 };
  for (const [pi, ps] of pages.entries()) {
    const base = "pagesSettings." + pi,
      page = ps.page || {};
    if (!page.id || pageIds.has(page.id))
      add("page_id", base + ".page.id", "Missing or duplicate page id.");
    pageIds.add(page.id);
  }
  function walk(value, at) {
    if (typeof value === "string" && /^fbpat_[A-Za-z0-9_-]{12,}$/.test(value))
      add("secret", at, "A credential is embedded in the artifact.");
    if (!value || typeof value !== "object") return;
    if (
      paletteInput &&
      value.type === "palette" &&
      value.groupId &&
      !palettes.has(value.groupId)
    )
      add("palette_group", at, "Unknown palette group.");
    if (
      paletteInput &&
      value.type === "color" &&
      value.colorId &&
      !colors.has(value.groupId + "/" + value.colorId)
    )
      add("palette_color", at, "Unknown group/color pair.");
    for (const [key, child] of Object.entries(value)) {
      if (
        /^(password|authorization|refreshToken|accessToken|patToken)$/i.test(
          key,
        ) &&
        child
      )
        add(
          "secret",
          at + "." + key,
          "A secret field is embedded in the artifact.",
        );
      walk(child, at + "." + key);
    }
  }
  walk(document, "document");
  for (const [pi, ps] of pages.entries()) {
    const base = "pagesSettings." + pi,
      page = ps.page || {};
    const widgets = ps.visualizationsV3 || [],
      filters = ps.filtersV3 || [],
      groups = ps.groupsVisualizationsV3 || [];
    counts.widgets += widgets.length;
    counts.filters += filters.length;
    const objects = [...widgets, ...filters, ...groups];
    const ids = objects.map((o) => o.id),
      idSet = new Set(ids),
      groupIds = new Set(groups.map((g) => g.id));
    for (const [oi, object] of objects.entries()) {
      if (!object.id || globalIds.has(object.id))
        add(
          "object_id",
          base + ".objects." + oi,
          "Missing or duplicate object id across pages.",
        );
      globalIds.add(object.id);
      if (object.pageId && object.pageId !== page.id)
        add(
          "foreign_page",
          base + ".objects." + oi + ".pageId",
          "Object belongs to another page.",
        );
    }
    const layers = ps.indeces?.layers;
    if (!Array.isArray(layers))
      add(
        "layers_missing",
        base + ".indeces.layers",
        "Explicit layer order is required.",
      );
    else {
      if (new Set(layers).size !== layers.length)
        add("layer_duplicate", base + ".indeces.layers", "Duplicate layer id.");
      if (ids.some((id) => !layers.includes(id)))
        add(
          "layer_missing",
          base + ".indeces.layers",
          "At least one object has no layer.",
        );
      if (layers.some((id) => !idSet.has(id)))
        add(
          "layer_foreign",
          base + ".indeces.layers",
          "Layer references an absent object.",
        );
    }
    if (ps.indeces?.pageId !== page.id)
      add(
        "layer_page",
        base + ".indeces.pageId",
        "Layer owner does not match page id.",
      );
    const variables = page.variables || [],
      vars = new Map();
    for (const v of variables) {
      if (!v.id || vars.has(v.id))
        add(
          "variable_id",
          base + ".page.variables",
          "Missing or duplicate variable id.",
        );
      vars.set(v.id, v);
    }
    const size = page.boardSettings?.sizes;
    if (!(Number(size?.width) > 0 && Number(size?.height) > 0))
      add(
        "board_size",
        base + ".page.boardSettings",
        "Positive board dimensions are required.",
      );
    for (const [oi, object] of [...widgets, ...filters].entries()) {
      const at = base + ".objects." + oi,
        view = object.viewSettings || object;
      const group = view.group,
        box = object.positionConfig;
      if (group?.isGrouped && (!group.groupId || !groupIds.has(group.groupId)))
        add(
          "dead_group",
          at + ".group",
          "Grouped object has no existing group.",
        );
      if (box && !group?.isGrouped) {
        if (
          ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
          box.x < 0 ||
          box.y < 0 ||
          box.width <= 0 ||
          box.height <= 0 ||
          box.x + box.width > size?.width ||
          box.y + box.height > size?.height
        )
          add(
            "geometry",
            at + ".positionConfig",
            "Invalid or out-of-board coordinates.",
          );
      }
      const padding = view.paddingSettings;
      if (
        padding?.unsetPaddings === false &&
        ["top", "right", "bottom", "left"].some((k) => Number(padding[k]) > 0)
      )
        add(
          "padding_disabled",
          at + ".paddingSettings",
          "Nonzero padding is disabled by unsetPaddings=false on the verified frontend.",
          true,
        );
      const events = object.events || {},
        vs = events.variablesSettings || {};
      const receiver = vs.control?.view;
      if (receiver?.isActive) {
        if (!vars.has(receiver.variableId))
          add(
            "receiver_variable",
            at + ".events",
            "Visibility references a missing variable.",
          );
        const variable = vars.get(receiver.variableId);
        if (
          variable?.type === "boolean" &&
          ["true", "false"].includes(variable.status) &&
          object.isVisible !== (variable.status === "true")
        )
          add(
            "initial_visibility",
            at + ".isVisible",
            "Initial visibility and boolean value disagree.",
          );
      }
      if (vs.isActive && vs.mode !== "separated" && !vs.variables?.length)
        add(
          "writer_empty",
          at + ".events",
          "Common variable writer has no assignments.",
        );
      for (const assignment of vs.variables || []) {
        if (!vars.has(assignment.variableId))
          add(
            "writer_variable",
            at + ".events",
            "Writer references a missing variable.",
          );
        if (!["true", "false", "invert"].includes(assignment.status))
          add(
            "writer_status",
            at + ".events",
            "Unsupported boolean assignment.",
          );
        if (
          assignment.status === "invert" &&
          vars.get(assignment.variableId)?.type !== "boolean"
        )
          add("writer_invert", at + ".events", "invert requires a boolean.");
      }
      if (
        events.goTo?.isActive &&
        (!events.goTo.to?.id || !pageIds.has(events.goTo.to.id))
      )
        add(
          "navigation_target",
          at + ".events.goTo",
          "Destination page is absent from this complete export.",
        );
      if (
        object.visualisationType === "text" &&
        events.goTo?.isActive &&
        events.transitionSettings?.isActive
      )
        add(
          "navigation_conflict",
          at + ".events",
          "Text goTo can be intercepted by transitionSettings without a data point.",
        );
      if (!object.visualisationType) continue;
      const data = object.dataSettings || {},
        sql = object.sqlData || {};
      if (sql.isFreeMode === true)
        add(
          "free_mode",
          at + ".sqlData",
          "Free mode is outside the default widget contract.",
        );
      if (/^\s*SELECT\b/i.test(sql.filterAndGroupRequest || ""))
        add(
          "full_select",
          at + ".sqlData",
          "Filter/group slot contains a full SELECT.",
        );
      if (/\{(?:date_|period_)[^}]*\}/i.test(JSON.stringify(sql)))
        add(
          "fake_date",
          at + ".sqlData",
          "Date placeholders are not page filters.",
        );
      if (
        data.isRealData &&
        (!data.modelId || (models && !models.has(data.modelId)))
      )
        add(
          "model",
          at + ".dataSettings.modelId",
          "Missing or disallowed model id.",
        );
      if (object.visualisationType === "text" && data.isRealData) {
        const template = view.text?.text || "";
        for (const v of data.variables || []) {
          if (!v.customRequest?.trim())
            add(
              "kpi_sql",
              at + ".variables",
              "A real-data variable has no SQL expression.",
            );
          if (!template.includes("{{" + v.name + "}}"))
            add(
              "kpi_placeholder",
              at + ".variables",
              "Variable is absent from the outer template.",
              true,
            );
          const inner = v.settings?.textPropertiesSettings?.text?.text;
          if (
            !v.settings?.vectorSettings?.isVector &&
            (typeof inner !== "string" || !inner.includes("value"))
          )
            add(
              "kpi_template",
              at + ".variables",
              "Numeric/text value template must include the value marker.",
            );
        }
      }
    }
  }
  return {
    status:
      errors.length || (options.strict && warnings.length) ? "FAIL" : "PASS",
    counts,
    errors,
    warnings,
  };
}
function main(argv) {
  const file = argv[0];
  if (!file || file.startsWith("--"))
    throw new Error(
      "Usage: check-dashboard.cjs dashboard.json [--palettes colors.json] [--models models.json] [--strict] [--out report.json]",
    );
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i < 0 ? null : argv[i + 1];
  };
  const report = validate(readJson(file), {
    strict: argv.includes("--strict"),
    palettes: arg("--palettes") ? readJson(arg("--palettes")) : null,
    models: arg("--models") ? readJson(arg("--models")) : null,
  });
  const out = arg("--out");
  if (out) {
    if (!fs.statSync(path.dirname(path.resolve(out))).isDirectory())
      throw new Error("Output parent is not a directory.");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
  return report.status === "PASS" ? 0 : 1;
}
if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
}
module.exports = { validate, readJson };
