/**
 * Interactive schema entity-relationship diagram for docs hub.
 *
 * Renders Postgres table groups and relationships with Cytoscape + dagre inside
 * `docs/index.html`. Source table semantics mirror `packages/db/src/pg-schema.ts`.
 *
 * Responsibilities:
 * - Define domain-colored group nodes and functional table summaries
 * - Layout modules in a 2×3 grid with inner and cross-module edges
 * - Expose `window.schemaErdInit` / `window.schemaErdResize` for lazy section load
 *
 * Depends on:
 * - `jslibary/cytoscape.min.js`, `dagre.min.js`, `cytoscape-dagre.js` (loaded by HTML shell)
 *
 * Notes:
 * - IIFE avoids global pollution except documented init hooks on `window`
 */
(function () {
  var DOMAINS = {
    billing: { bg: "#f8fafc", border: "#64748b", label: "Billing" },
    crm: { bg: "#ecfdf5", border: "#059669", label: "CRM" },
    core: { bg: "#eef2ff", border: "#4f46e5", label: "Core / auth" },
    sales: { bg: "#f5f3ff", border: "#7c3aed", label: "Sales funnel" },
    workforce: { bg: "#ccfbf1", border: "#0d9488", label: "Workforce" }
  };

  var DOMAIN_ORDER = ["billing", "crm", "core", "sales", "workforce"];

  /** 3 + 2 grid — Core hub top-right */
  var DOMAIN_GRID = [
    ["billing", "crm", "core"],
    ["sales", "workforce"]
  ];

  function group(domain) {
    var d = DOMAINS[domain];
    return {
      data: {
        id: "group-" + domain,
        domain: domain,
        bg: d.bg,
        border: d.border,
        label: d.label
      },
      classes: "schema-group"
    };
  }

  /** Table node: title + short functional lines (not column lists) */
  function entity(id, title, domain, summaryLines) {
    var d = DOMAINS[domain];
    return {
      data: {
        id: id,
        parent: "group-" + domain,
        domain: domain,
        bg: d.bg,
        border: d.border,
        label: title + "\n" + summaryLines.join("\n")
      },
      classes: "schema-table"
    };
  }

  function innerEdge(id, source, target, label) {
    return {
      data: { id: id, source: source, target: target, label: label || "" },
      classes: "inner-link"
    };
  }

  function blockEdge(id, source, target, label, optional) {
    return {
      data: {
        id: id,
        source: source,
        target: target,
        label: label,
        optional: !!optional
      },
      classes: "block-link" + (optional ? " optional" : "")
    };
  }

  var nodes = DOMAIN_ORDER.map(group).concat([
    entity("platform_subscription_plans", "Subscription plans", "billing", [
      "Platform catalog of tiers",
      "Tenant-wide vs per-user scope"
    ]),
    entity("subscriptions", "Subscriptions", "billing", [
      "Active plan for tenant or user",
      "Dunning & renewal state"
    ]),
    entity("platform_subscription_payments", "Subscription payments", "billing", [
      "Payment history & receipts",
      "PSP correlation (Stripe, etc.)"
    ]),

    entity("crm_organizations", "Organizations", "crm", [
      "Companies & accounts",
      "Tenant-scoped customer records"
    ]),
    entity("crm_contacts", "Contacts", "crm", [
      "People & stakeholders",
      "Linked to organizations"
    ]),
    entity("crm_relationship_types", "Relationship types", "crm", [
      "Configurable link semantics",
      "e.g. org owns contact, partner of"
    ]),
    entity("crm_relationships", "Relationships", "crm", [
      "Edges in the CRM graph",
      "Connects two entities via a type"
    ]),
    entity("crm_activities", "CRM activities", "crm", [
      "Notes, calls, tasks",
      "Attached to org or contact"
    ]),

    entity("tenants", "Tenants", "core", [
      "Organization / realm root",
      "Feature flags & realm settings"
    ]),
    entity("users", "Users", "core", [
      "Login identities",
      "Tenant members & super-admins"
    ]),
    entity("refresh_tokens", "Refresh tokens", "core", [
      "Rotating session credentials",
      "Tied to a user account"
    ]),
    entity("tenant_user_module_roles", "Module roles", "core", [
      "Per-user access per module",
      "CRM, sales, workforce, …"
    ]),

    entity("sales_funnel_bdr_leads", "BDR leads", "sales", [
      "Top-of-funnel qualification queue",
      "May reference a CRM organization"
    ]),
    entity("sales_funnel_sales_deals", "Sales deals", "sales", [
      "Pipeline opportunities & stages",
      "Can be promoted from a lead"
    ]),
    entity("sales_funnel_contacts_junction", "Lead & deal contacts", "sales", [
      "Many-to-many to CRM contacts",
      "Who is involved on a record"
    ]),
    entity("sales_funnel_activities", "Sales activities", "sales", [
      "Timeline on a lead or deal",
      "Calls, notes, system events"
    ]),

    entity("workforce_employees", "Employees", "workforce", [
      "People in the HRM module",
      "Optional org-unit assignment"
    ]),
    entity("workforce_org_units", "Org units", "workforce", [
      "Departments & teams",
      "Nested hierarchy per tenant"
    ])
  ]);

  /** Primary relationships inside each domain block */
  var innerEdges = [
    innerEdge("i-users-tenants", "users", "tenants", "belongs to"),
    innerEdge("i-refresh-users", "refresh_tokens", "users", "session for"),
    innerEdge("i-roles-users", "tenant_user_module_roles", "users", "grants"),

    innerEdge("i-sub-plan", "subscriptions", "platform_subscription_plans", "on plan"),
    innerEdge("i-pay-sub", "platform_subscription_payments", "subscriptions", "pays"),

    innerEdge("i-rel-type", "crm_relationships", "crm_relationship_types", "typed as"),

    innerEdge("i-deal-lead", "sales_funnel_sales_deals", "sales_funnel_bdr_leads", "promoted from"),
    innerEdge("i-junction-lead", "sales_funnel_contacts_junction", "sales_funnel_bdr_leads", "on lead"),
    innerEdge("i-junction-deal", "sales_funnel_contacts_junction", "sales_funnel_sales_deals", "on deal"),

    innerEdge("i-emp-unit", "workforce_employees", "workforce_org_units", "placed in"),
    innerEdge("i-unit-parent", "workforce_org_units", "workforce_org_units", "reports to")
  ];

  /** Adjacent cells only — flows along the 2×3 grid (no long diagonals) */
  var blockEdges = [
    blockEdge("b-billing-crm", "group-billing", "group-crm", "Platform billing"),
    blockEdge("b-crm-core", "group-crm", "group-core", "Auth & tenancy"),
    blockEdge("b-core-sales", "group-core", "group-sales", "Tenant-scoped"),
    blockEdge("b-sales-workforce", "group-sales", "group-workforce", "People & teams"),
    blockEdge("b-crm-sales", "group-crm", "group-sales", "Orgs & contacts", true)
  ];

  var edges = innerEdges.concat(blockEdges);

  function buildLegend(container) {
    if (!container) return;
    DOMAIN_ORDER.forEach(function (key) {
      var d = DOMAINS[key];
      var span = document.createElement("span");
      span.className = "schema-erd-legend__item";
      var swatch = document.createElement("i");
      swatch.style.background = d.bg;
      swatch.style.borderColor = d.border;
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(d.label));
      container.appendChild(span);
    });
    var hint = document.createElement("span");
    hint.className = "schema-erd-legend__hint";
    hint.textContent = "2×3 module grid · thick arrows = cross-module · thin = inside a module";
    container.appendChild(hint);
  }

  function innerEdgesInCluster(cy, parent) {
    var childIds = {};
    parent.children().forEach(function (n) {
      childIds[n.id()] = true;
    });
    return cy.edges(".inner-link").filter(function (e) {
      return childIds[e.source().id()] && childIds[e.target().id()];
    });
  }

  function layoutCluster(cy, parent) {
    var children = parent.children();
    if (children.length === 0) return;

    var layoutEles = children.union(innerEdgesInCluster(cy, parent));
    layoutEles.layout({
      name: "dagre",
      rankDir: "TB",
      ranker: "network-simplex",
      nodeDimensionsIncludeLabels: true,
      nodeSep: 44,
      rankSep: 64,
      edgeSep: 16,
      fit: false,
      animate: false
    }).run();
  }

  function placeDomainMatrix(cy) {
    var cols = DOMAIN_GRID[0].length;
    var rows = DOMAIN_GRID.length;
    var padX = 40;
    var padY = 40;
    var gapX = 72;
    var gapY = 88;
    var colWidths = [];
    var rowHeights = [];
    var c;
    var r;

    for (c = 0; c < cols; c++) colWidths[c] = 0;
    for (r = 0; r < rows; r++) rowHeights[r] = 0;

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var domain = DOMAIN_GRID[r][c];
        var parent = cy.getElementById("group-" + domain);
        if (parent.empty()) continue;
        layoutCluster(cy, parent);
        var bb = parent.boundingBox({ includeLabels: true });
        colWidths[c] = Math.max(colWidths[c], bb.w);
        rowHeights[r] = Math.max(rowHeights[r], bb.h);
      }
    }

    var xOff = [padX];
    for (c = 1; c < cols; c++) xOff[c] = xOff[c - 1] + colWidths[c - 1] + gapX;
    var yOff = [padY];
    for (r = 1; r < rows; r++) yOff[r] = yOff[r - 1] + rowHeights[r - 1] + gapY;

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var domainCell = DOMAIN_GRID[r][c];
        var group = cy.getElementById("group-" + domainCell);
        if (group.empty()) continue;
        var box = group.boundingBox({ includeLabels: true });
        group.shift({ x: xOff[c] - box.x1, y: yOff[r] - box.y1 });
      }
    }
  }

  function routeBlockEdges(cy) {
    cy.edges(".block-link").forEach(function (edge) {
      var s = edge.source().boundingBox();
      var t = edge.target().boundingBox();
      var scx = (s.x1 + s.x2) / 2;
      var scy = (s.y1 + s.y2) / 2;
      var tcx = (t.x1 + t.x2) / 2;
      var tcy = (t.y1 + t.y2) / 2;
      var dx = tcx - scx;
      var dy = tcy - scy;
      var mostlyHorizontal = Math.abs(dx) > Math.abs(dy);

      if (mostlyHorizontal) {
        edge.style({
          "curve-style": "taxi",
          "taxi-direction": "horizontal",
          "taxi-turn-min-distance": 16
        });
      } else {
        edge.style({
          "curve-style": "taxi",
          "taxi-direction": "vertical",
          "taxi-turn-min-distance": 16
        });
      }
    });
  }

  var cyInstance = null;
  var legendBuilt = false;

  function sectionVisible(cyEl) {
    var seg = cyEl.closest("[data-section-role]");
    return !seg || !seg.hidden;
  }

  function resizeSchemaErd() {
    if (!cyInstance) return;
    cyInstance.resize();
    routeBlockEdges(cyInstance);
    cyInstance.fit(undefined, 64);
  }

  window.schemaErdResize = resizeSchemaErd;
  window.schemaErdInit = initSchemaErd;

  function initSchemaErd() {
    var cyEl = document.getElementById("schema-erd-cy");
    if (!cyEl || typeof cytoscape === "undefined" || typeof cytoscapeDagre === "undefined") {
      return;
    }
    if (!sectionVisible(cyEl)) {
      return;
    }
    if (cyInstance) {
      resizeSchemaErd();
      return;
    }

    if (!legendBuilt) {
      buildLegend(document.getElementById("schema-erd-legend"));
      legendBuilt = true;
    }

    cytoscape.use(cytoscapeDagre);

    cyInstance = cytoscape({
      container: cyEl,
      elements: { nodes: nodes, edges: edges },
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      style: [
        {
          selector: "node.schema-table",
          style: {
            shape: "round-rectangle",
            "background-color": "data(bg)",
            "border-color": "data(border)",
            "border-width": 2,
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10,
            "font-family": "system-ui, Segoe UI, sans-serif",
            color: "#0f172a",
            "text-wrap": "wrap",
            "text-max-width": 160,
            width: "label",
            height: "label",
            padding: "14px"
          }
        },
        {
          selector: "node.schema-group",
          style: {
            label: "data(label)",
            "text-valign": "top",
            "text-halign": "center",
            "text-margin-y": 8,
            "font-size": 13,
            "font-weight": 700,
            "font-family": "system-ui, Segoe UI, sans-serif",
            color: "data(border)",
            "background-color": "data(bg)",
            "background-opacity": 0.18,
            "border-color": "data(border)",
            "border-width": 2,
            padding: "32px"
          }
        },
        {
          selector: "edge.inner-link",
          style: {
            width: 1.5,
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.9,
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 9,
            color: "#334155",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.9,
            "text-background-padding": 3,
            "z-index": 1
          }
        },
        {
          selector: "edge.block-link",
          style: {
            width: 2.5,
            "line-color": "#4f46e5",
            "target-arrow-color": "#4338ca",
            "target-arrow-shape": "triangle",
            "arrow-scale": 1,
            label: "data(label)",
            "font-size": 10,
            "font-weight": 600,
            color: "#312e81",
            "text-background-color": "#eef2ff",
            "text-background-opacity": 0.95,
            "text-background-padding": 4,
            "z-index": 10,
            "overlay-opacity": 0
          }
        },
        {
          selector: "edge.block-link.optional",
          style: {
            "line-style": "dashed",
            "line-color": "#7c3aed",
            "target-arrow-color": "#6d28d9",
            width: 2.5
          }
        }
      ],
      layout: { name: "preset" }
    });

    placeDomainMatrix(cyInstance);
    routeBlockEdges(cyInstance);
    cyInstance.edges(".block-link").raise();
    cyInstance.fit(undefined, 64);
  }

  function boot() {
    var cyEl = document.getElementById("schema-erd-cy");
    if (!cyEl) return;
    initSchemaErd();
    if (typeof IntersectionObserver !== "undefined") {
      var observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) {
          return e.isIntersecting;
        })) {
          initSchemaErd();
        }
      });
      observer.observe(cyEl);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
