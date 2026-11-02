/* generated from lib/rules.mjs by scripts/build-client.mjs: edit that file, not this one */
var PCSRules = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/rules.mjs
  var rules_exports = {};
  __export(rules_exports, {
    ALERT_DEFAULTS: () => ALERT_DEFAULTS,
    RULE_DEFS: () => RULE_DEFS,
    activeItems: () => activeItems,
    approvalState: () => approvalState,
    attention: () => attention,
    daysBetween: () => daysBetween,
    docketsOf: () => docketsOf,
    invoicesOf: () => invoicesOf,
    isApprover: () => isApprover,
    itemFor: () => itemFor,
    list: () => list,
    localDate: () => localDate,
    localHour: () => localHour,
    poNeedsApproval: () => poNeedsApproval,
    poSig: () => poSig,
    poTotal: () => poTotal,
    quoteNeedsApproval: () => quoteNeedsApproval,
    quoteSig: () => quoteSig,
    quoteTotals: () => quoteTotals,
    settingsOf: () => settingsOf,
    stageSince: () => stageSince,
    stateId: () => stateId
  });
  var RULE_DEFS = [
    { id: "lead_idle", label: "Lead with no quote yet", days: 3, unit: "days in Lead" },
    { id: "quote_followup", label: "Quote awaiting customer response", days: 7, repeat: 7, unit: "days after sending (repeats)" },
    { id: "quote_expiring", label: "Quote about to expire", days: 3, unit: "days before it expires" },
    { id: "po_not_started", label: "Customer PO received, production not started", days: 2, unit: "days" },
    { id: "build_overdue", label: "Build order past its due date", days: 0, unit: "days after due" },
    { id: "ready_not_dispatched", label: "Ready but not dispatched", days: 2, unit: "days" },
    { id: "not_invoiced", label: "Dispatched but not invoiced", days: 1, unit: "days after the docket" },
    { id: "payment_overdue", label: "Invoice payment overdue", days: 0, repeat: 7, unit: "days after due (repeats weekly)" },
    { id: "rfq_no_reply", label: "RFQ: supplier quote not received", days: 0, unit: "days after reply-by date" },
    { id: "po_late", label: "Supplier delivery late", days: 0, unit: "days after expected date" },
    { id: "next_action", label: "Next action date passed", days: 0, unit: "days after the date" },
    { id: "stock_low", label: "Stock below its minimum (counting stock on order)", days: 0, unit: "(uses each item\u2019s minimum on the Stock tab)" },
    { id: "sale_short", label: "Not enough stock for an open sale", days: 0, unit: "(sales at PO received, production or ready)" }
  ];
  var ALERT_DEFAULTS = {
    rules: Object.fromEntries(RULE_DEFS.map((r) => [r.id, { on: true, days: r.days }])),
    approvals: { quoteValue: 2e4, quoteDiscount: 0, poValue: 2e4, priceIncrease: 0 },
    // anything over $20,000 needs a Director; 0 = off
    titles: {},
    // { email: 'Admin' | 'Manager' | 'Director' }: Admin and Manager are the same (title only); Directors approve
    directors: "",
    // comma-separated emails of the Directors who approve (kept in step with titles). If none, admins approve.
    managers: "",
    // comma-separated emails; get escalations and unowned items
    escalateDays: 3,
    // days past a rule's limit before it escalates to managers
    digestHour: 7,
    // local hour for the daily summary email
    timezone: "Australia/Perth"
  };
  var num = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };
  var list = (v) => String(v || "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  function settingsOf(raw) {
    const r = raw || {};
    const rules = { ...ALERT_DEFAULTS.rules };
    for (const [k, v] of Object.entries(r.rules || {})) if (rules[k]) rules[k] = { ...rules[k], ...v };
    const titles = { ...r.titles || {} };
    const fromTitles = Object.entries(titles).filter(([, t]) => t === "Director").map(([e]) => e);
    const directors = r.titles ? fromTitles.join(", ") : r.directors ?? r.approvers ?? "";
    return { ...ALERT_DEFAULTS, ...r, titles, directors, rules, approvals: { ...ALERT_DEFAULTS.approvals, ...r.approvals || {} } };
  }
  function localDate(tz, d = /* @__PURE__ */ new Date()) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
  function localHour(tz, d = /* @__PURE__ */ new Date()) {
    try {
      return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d)) % 24;
    } catch {
      return d.getUTCHours();
    }
  }
  var day = (s) => String(s || "").slice(0, 10);
  var daysBetween = (a, b) => Math.round((Date.parse(day(b) + "T00:00:00Z") - Date.parse(day(a) + "T00:00:00Z")) / 864e5);
  var addDays = (iso, n) => {
    const d = /* @__PURE__ */ new Date(day(iso) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + num(n));
    return d.toISOString().slice(0, 10);
  };
  var docketsOf = (d) => d.dockets || (d.dispatch ? [d.dispatch] : []);
  var invoicesOf = (d) => d.invoices || (d.invoice ? [d.invoice] : []);
  function quoteTotals(q) {
    const sub = (q?.lines || []).reduce((a, l) => a + num(l.qty) * num(l.price) * (1 - num(l.disc) / 100), 0);
    return { sub, total: sub * (q?.gst === false ? 1 : 1.1) };
  }
  var poTotal = (po) => (po.lines || []).reduce((a, l) => a + num(l.qty) * num(l.price), 0);
  function stageSince(d) {
    const h = d.history || [];
    let since = null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].stage === d.stage) since = h[i].at;
      else if (h[i].stage) break;
    }
    return day(since || d.stageAt || d.updatedAt || d.createdAt || "");
  }
  var quoteSig = (q) => JSON.stringify([(q?.lines || []).map((l) => [l.itemId || l.code, num(l.qty), num(l.price), num(l.disc)]), q?.gst !== false]);
  var poSig = (po) => JSON.stringify((po.lines || []).map((l) => [l.itemId, num(l.qty), num(l.price)]));
  function quoteNeedsApproval(q, s) {
    if (!q || !(q.lines || []).length) return null;
    const a = settingsOf(s).approvals;
    const t = quoteTotals(q).sub;
    const maxDisc = Math.max(0, ...(q.lines || []).map((l) => num(l.disc)));
    const why = [];
    if (num(a.quoteValue) > 0 && t > num(a.quoteValue)) why.push(`value over $${num(a.quoteValue).toLocaleString("en-AU")}`);
    if (num(a.quoteDiscount) > 0 && maxDisc > num(a.quoteDiscount)) why.push(`discount ${maxDisc}% (limit ${num(a.quoteDiscount)}%)`);
    return why.length ? why.join(" and ") : null;
  }
  function poNeedsApproval(po, s) {
    const a = settingsOf(s).approvals;
    const t = poTotal(po);
    return num(a.poValue) > 0 && t > num(a.poValue) ? `value over $${num(a.poValue).toLocaleString("en-AU")}` : null;
  }
  function approvalState(approval, sig, reason) {
    if (!reason) return "none";
    if (approval?.status === "approved" && approval.sig === sig) return "approved";
    if (approval?.status === "pending" && approval.sig === sig) return "pending";
    if (approval?.status === "rejected" && approval.sig === sig) return "rejected";
    return "needed";
  }
  function isApprover(email, role, s) {
    const d = list(settingsOf(s).directors);
    if (d.length) return !!email && d.includes(String(email).toLowerCase());
    return role === "admin";
  }
  function attention(data) {
    const s = settingsOf(data.alertSettings);
    const today = data.today;
    const R = s.rules;
    const on = (id) => R[id] && R[id].on !== false;
    const lim = (id) => num(R[id]?.days);
    const cust = (id) => (data.customers || []).find((c) => c._id === id)?.name || "";
    const sup = (id) => (data.suppliers || []).find((c) => c._id === id)?.name || "";
    const deals = data.deals || [];
    const dealOf = (id) => deals.find((d) => d._id === id);
    const ownerOf = (d) => d ? String(d.owner || (String(d.createdBy || "").includes("@") ? d.createdBy : "") || "").toLowerCase() : "";
    const out = [];
    const push = (it, def) => {
      const over = Math.max(0, it.age - (def ?? 0));
      out.push({ severity: "due", escalate: it.severity !== "approval" && over >= num(s.escalateDays), ...it });
    };
    for (const d of deals) {
      if (["closed", "lost"].includes(d.stage)) continue;
      const base = { coll: "deals", id: d._id, no: d.no, saleNo: d.no, owner: ownerOf(d), customer: cust(d.customerId) };
      const since = stageSince(d);
      const inStage = since ? daysBetween(since, today) : 0;
      const q = d.quote;
      if (on("lead_idle") && d.stage === "lead" && inStage >= lim("lead_idle"))
        push({ ...base, key: `lead_idle:${d._id}:${since}`, rule: "lead_idle", label: "Lead not quoted", title: `${d.no} \xB7 ${base.customer || "No customer"}`, detail: `${inStage} days in Lead${d.title ? " \xB7 " + d.title : ""}`, since, age: inStage, severity: "overdue" }, lim("lead_idle"));
      if (d.stage === "quote" && q) {
        if (on("quote_followup")) {
          const sent = day(q.sentAt) || since;
          const age = sent ? daysBetween(sent, today) : 0;
          const L = lim("quote_followup");
          const rep = num(RULE_DEFS.find((r) => r.id === "quote_followup").repeat) || 7;
          if (age >= L) {
            const n = Math.floor((age - L) / rep);
            push({ ...base, key: `quote_followup:${d._id}:${q.no}:${sent}:${n}`, rule: "quote_followup", label: n ? `Follow up quote again` : "Follow up quote", title: `${q.no} \xB7 ${base.customer}`, detail: `Sent ${age} days ago, no PO yet`, since: sent, age, severity: "overdue" }, L);
          }
        }
        if (on("quote_expiring") && q.date) {
          const exp = addDays(q.date, num(q.valid) || 30);
          const left = daysBetween(today, exp);
          if (left <= lim("quote_expiring")) push({ ...base, key: `quote_expiring:${d._id}:${q.no}:${exp}:${left < 0 ? "x" : "e"}`, rule: "quote_expiring", label: left < 0 ? "Quote expired" : "Quote expiring", title: `${q.no} \xB7 ${base.customer}`, detail: left < 0 ? `Expired ${-left} day${left === -1 ? "" : "s"} ago` : `Expires in ${left} day${left === 1 ? "" : "s"} (${exp})`, since: exp, age: Math.max(0, -left), severity: left < 0 ? "overdue" : "due" }, 0);
        }
      }
      if (q?.approval?.status === "pending")
        push({ ...base, key: `approval:quote:${d._id}:${q.approval.requestedAt}`, rule: "approval", label: "Quote approval", title: `${q.no} \xB7 ${base.customer}`, detail: `Requested by ${q.approval.requestedByName || q.approval.requestedBy || "someone"}: ${q.approval.reason || ""}`, since: day(q.approval.requestedAt), age: daysBetween(day(q.approval.requestedAt), today), severity: "approval", approvers: true, requester: q.approval.requestedBy });
      if (on("po_not_started") && d.stage === "po" && inStage >= lim("po_not_started"))
        push({ ...base, key: `po_not_started:${d._id}:${since}`, rule: "po_not_started", label: "Production not started", title: `${d.no} \xB7 ${base.customer}`, detail: `Customer PO ${d.po?.no || ""} received ${inStage} days ago`, since, age: inStage, severity: "overdue" }, lim("po_not_started"));
      if (on("ready_not_dispatched") && d.stage === "ready" && inStage >= lim("ready_not_dispatched"))
        push({ ...base, key: `ready_not_dispatched:${d._id}:${since}`, rule: "ready_not_dispatched", label: "Not dispatched", title: `${d.no} \xB7 ${base.customer}`, detail: `Ready for ${inStage} days`, since, age: inStage, severity: "overdue" }, lim("ready_not_dispatched"));
      if (on("not_invoiced")) for (const k of docketsOf(d)) {
        if (invoicesOf(d).some((v) => v.docketNo === k.docketNo)) continue;
        const age = daysBetween(k.date, today);
        if (age >= lim("not_invoiced")) push({ ...base, key: `not_invoiced:${d._id}:${k.docketNo}`, rule: "not_invoiced", label: "Not invoiced", title: `${k.docketNo} \xB7 ${base.customer}`, detail: `Dispatched ${age} days ago, no invoice`, since: day(k.date), age, severity: "overdue" }, lim("not_invoiced"));
      }
      if (on("payment_overdue")) for (const v of invoicesOf(d)) {
        if (v.paid || !v.due) continue;
        const age = daysBetween(v.due, today);
        const L = lim("payment_overdue");
        if (age > L) {
          const n = Math.floor((age - L - 1) / 7);
          push({ ...base, key: `payment_overdue:${d._id}:${v.no}:${n}`, rule: "payment_overdue", label: "Payment overdue", title: `${v.no} \xB7 ${base.customer}`, detail: `$${num(v.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })} due ${v.due} (${age} days overdue)`, since: v.due, age, severity: "overdue" }, L);
        }
      }
      if (on("next_action") && d.nextDate && day(d.nextDate) < today) {
        const age = daysBetween(d.nextDate, today);
        if (age >= lim("next_action")) push({ ...base, key: `next_action:${d._id}:${day(d.nextDate)}`, rule: "next_action", label: "Next action overdue", title: `${d.no} \xB7 ${base.customer}`, detail: `${d.nextAction || "Next action"} was due ${day(d.nextDate)}`, since: day(d.nextDate), age, severity: "overdue" }, lim("next_action"));
      }
    }
    if (on("build_overdue")) for (const o of data.orders || []) {
      if (o.status !== "open" || !o.due) continue;
      const age = daysBetween(o.due, today);
      if (age > lim("build_overdue")) {
        const d = dealOf(o.dealId);
        push({ coll: "orders", id: o._id, no: o.no, saleNo: d?.no || "", owner: ownerOf(d), key: `build_overdue:${o._id}:${o.due}`, rule: "build_overdue", label: "Build overdue", title: `${o.no}${d ? " \xB7 " + d.no : ""}`, detail: `Due ${o.due} (${age} days late)`, since: o.due, age, severity: "overdue" }, lim("build_overdue"));
      }
    }
    for (const r of data.rfqs || []) {
      const d = dealOf(r.saleId);
      const owner = ownerOf(d) || (String(r.createdBy || "").includes("@") ? String(r.createdBy).toLowerCase() : "");
      if (on("rfq_no_reply") && r.status === "sent" && r.replyBy && day(r.replyBy) < today) {
        const waiting = (r.suppliers || []).filter((x) => x.sentAt && !x.quote).map((x) => sup(x.supplierId));
        const age = daysBetween(r.replyBy, today);
        if (waiting.length && age > lim("rfq_no_reply")) push({ coll: "rfqs", id: r._id, no: r.no, saleNo: d?.no || "", owner, key: `rfq_no_reply:${r._id}:${r.replyBy}`, rule: "rfq_no_reply", label: "Supplier quote overdue", title: `${r.no}`, detail: `Waiting on ${waiting.join(", ")} (due ${day(r.replyBy)})`, since: day(r.replyBy), age, severity: "overdue" }, lim("rfq_no_reply"));
      }
      for (const x of r.suppliers || []) if (x.quote?.priceApproval?.status === "pending") {
        const pa = x.quote.priceApproval;
        push({ coll: "rfqs", id: r._id, no: r.no, saleNo: d?.no || "", owner, key: `approval:price:${r._id}:${x.supplierId}:${pa.requestedAt}`, rule: "approval", label: "Price increase approval", title: `${r.no} \xB7 ${sup(x.supplierId)}`, detail: `Requested by ${pa.requestedByName || pa.requestedBy || "someone"}: ${pa.reason || ""}`, since: day(pa.requestedAt), age: daysBetween(day(pa.requestedAt), today), severity: "approval", approvers: true, requester: pa.requestedBy });
      }
    }
    for (const po of data.pos || []) {
      const d = dealOf(po.saleId);
      const owner = ownerOf(d) || (String(po.createdBy || "").includes("@") ? String(po.createdBy).toLowerCase() : "");
      if (on("po_late") && ["sent", "part"].includes(po.status) && po.expected && day(po.expected) < today) {
        const age = daysBetween(po.expected, today);
        if (age > lim("po_late")) push({ coll: "pos", id: po._id, no: po.no, saleNo: d?.no || "", owner, key: `po_late:${po._id}:${po.expected}`, rule: "po_late", label: "Supplier delivery late", title: `${po.no} \xB7 ${sup(po.supplierId)}`, detail: `Expected ${day(po.expected)} (${age} days late)`, since: day(po.expected), age, severity: "overdue" }, lim("po_late"));
      }
      if (po.approval?.status === "pending")
        push({ coll: "pos", id: po._id, no: po.no, saleNo: d?.no || "", owner, key: `approval:po:${po._id}:${po.approval.requestedAt}`, rule: "approval", label: "PO approval", title: `${po.no} \xB7 ${sup(po.supplierId)}`, detail: `Requested by ${po.approval.requestedByName || po.approval.requestedBy || "someone"}: ${po.approval.reason || ""}`, since: day(po.approval.requestedAt), age: daysBetween(day(po.approval.requestedAt), today), severity: "approval", approvers: true, requester: po.approval.requestedBy });
    }
    const stock = new Map(data.stock || []);
    const partNo = (id) => data.parts?.get?.(id)?.partNo || id;
    const desc = (id) => data.parts?.get?.(id)?.description || "";
    const onOrder = /* @__PURE__ */ new Map();
    for (const po of data.pos || []) if (["draft", "sent", "part"].includes(po.status)) for (const l of po.lines || []) {
      const r = Math.max(0, num(l.qty) - num(l.received));
      if (r > 0 && l.itemId) onOrder.set(l.itemId, (onOrder.get(l.itemId) || 0) + r);
    }
    if (on("sale_short")) {
      const need = /* @__PURE__ */ new Map();
      for (const d of deals) {
        if (!["po", "production", "ready"].includes(d.stage)) continue;
        (d.quote?.lines || []).forEach((l, i) => {
          if (!l.itemId) return;
          const sent = docketsOf(d).reduce((a, k) => a + num(((k.lines || []).find((x) => x.li === i) || {}).supplied), 0);
          const built = (data.orders || []).some((o) => o.dealId === d._id && o.itemId === l.itemId);
          const q = Math.max(0, num(l.qty) - sent);
          if (q > 0 && !built) {
            if (!need.has(l.itemId)) need.set(l.itemId, []);
            need.get(l.itemId).push({ d, q });
          }
        });
      }
      for (const [id, list2] of need) {
        let avail = num(stock.get(id)?.onHand) + (onOrder.get(id) || 0);
        for (const { d, q } of list2.sort((a, b) => String(a.d.po?.required || a.d.no).localeCompare(String(b.d.po?.required || b.d.no)))) {
          const short = Math.max(0, q - Math.max(0, avail));
          avail -= q;
          if (short > 0) push({
            coll: "items",
            id,
            no: partNo(id),
            saleNo: d.no,
            owner: ownerOf(d),
            customer: cust(d.customerId),
            key: `sale_short:${d._id}:${id}:${short}`,
            rule: "sale_short",
            label: "Short for a sale",
            title: `${partNo(id)} \xB7 ${d.no}`,
            detail: `Need ${q} for ${cust(d.customerId) || d.no}${d.po?.required ? " by " + d.po.required : ""}; ${num(stock.get(id)?.onHand)} on hand, ${onOrder.get(id) || 0} on order (short ${short})${desc(id) ? " \xB7 " + desc(id) : ""}`,
            since: today,
            age: 0,
            severity: "overdue",
            saleId: d._id
          }, 0);
        }
      }
    }
    if (on("stock_low")) for (const [id, st] of stock) {
      const min = num(st.min);
      if (!min) continue;
      const oh = num(st.onHand);
      const oo = onOrder.get(id) || 0;
      if (oh >= min || oh + oo >= min) continue;
      push({
        coll: "items",
        id,
        no: partNo(id),
        saleNo: "",
        owner: "",
        key: `stock_low:${id}:${oh <= 0 ? "out" : "low"}:${String(st.updatedAt || "").slice(0, 10)}`,
        rule: "stock_low",
        label: oh <= 0 ? "Out of stock" : "Stock low",
        title: `${partNo(id)}${desc(id) ? " \xB7 " + desc(id) : ""}`,
        detail: `${oh} on hand, minimum ${min}${oo ? `, ${oo} on order` : ""}${st.location ? " \xB7 bin " + st.location : ""}`,
        since: today,
        age: 0,
        severity: oh <= 0 ? "overdue" : "due"
      }, 0);
    }
    const rank = { approval: 0, overdue: 1, due: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.age - a.age);
  }
  function activeItems(items, states, today) {
    const st = new Map((states || []).map((x) => [x.key || x._id || x.id, x]));
    return items.filter((it) => {
      const s = st.get(it.key);
      if (!s) return true;
      if (s.dismissed) return false;
      return !(s.snoozedUntil && day(s.snoozedUntil) > today);
    });
  }
  function stateId(key) {
    let h = 2166136261;
    for (const c of String(key)) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return "a" + h.toString(36) + String(key).length.toString(36);
  }
  function itemFor(it, email, role, s) {
    const e = String(email || "").toLowerCase();
    if (it.severity === "approval") return isApprover(e, role, s) || it.requester === e;
    if (it.owner && it.owner === e) return true;
    const mgr = list(settingsOf(s).managers).includes(e) || role === "admin" && !list(settingsOf(s).managers).length;
    return mgr && (it.escalate || !it.owner);
  }
  return __toCommonJS(rules_exports);
})();
