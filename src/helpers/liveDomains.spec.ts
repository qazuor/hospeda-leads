import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LIVE_DOMAIN_QUERY_KEYS, LIVE_QUERY_KEYS, LIVE_FRESH_MARGIN_MS, liveChangeTime, liveChangeWindow, liveLoadIncludes, liveQueryKeysToInvalidate, toClientTime, type LiveSnapshot } from "./liveDomains";

const domains={business:"1",work:"1",communication:"1",catalog:"1",journal:"1"};
const snapshot=(version:string,changes:Record<string,string>={}):LiveSnapshot=>({version,domains:{...domains,...changes}});

describe("liveQueryKeysToInvalidate", () => {
  it("does nothing on the first check or when nothing changed", () => {
    expect(liveQueryKeysToInvalidate({previous:null,next:snapshot("1")})).toEqual([]);
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("1")})).toEqual([]);
  });

  it("keeps the business list and stats out of communication-only changes", () => {
    const keys=liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{communication:"2"})});
    expect(keys).toEqual(["communication","resources","sales-materials","data-quality","commercial-detail","settings","lead-journal","global-journal","global-journal-filtered"]);
    expect(keys).not.toContain("leads");
    expect(keys).not.toContain("lead-stats");
    expect(keys).not.toContain("work");
  });

  it("keeps the business list out of journal-only changes", () => {
    const keys=liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{journal:"2"})});
    expect(keys).toEqual(["data-quality","commercial-detail","analytics","lead-journal","global-journal","global-journal-filtered"]);
  });

  it("refreshes only work queries for work configuration changes", () => {
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{work:"2"})})).toEqual(["work"]);
  });

  it("refreshes the list, my day and communication for business changes, but not settings", () => {
    const keys=liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{business:"2",work:"2"})});
    expect(keys).toEqual(expect.arrayContaining(["leads","lead-stats","work","communication","commercial-detail"]));
    expect(keys).not.toContain("settings");
  });

  it("refreshes everything for catalog changes", () => {
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{catalog:"2"})})).toEqual(LIVE_QUERY_KEYS);
  });

  it("merges several changed domains without duplicates, in live key order", () => {
    const keys=liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{work:"2",journal:"2"})});
    expect(keys).toEqual(LIVE_QUERY_KEYS.filter(key=>[...LIVE_DOMAIN_QUERY_KEYS.work,...LIVE_DOMAIN_QUERY_KEYS.journal].includes(key)));
  });

  it("treats a newly reported known domain as changed", () => {
    const previous:LiveSnapshot={version:"1",domains:{business:"1"}};
    expect(liveQueryKeysToInvalidate({previous,next:{version:"2",domains:{business:"1",work:"2"}}})).toEqual(["work"]);
  });

  it("falls back to every live key when the server does not report domains", () => {
    expect(liveQueryKeysToInvalidate({previous:{version:"1"},next:{version:"2"}})).toEqual(LIVE_QUERY_KEYS);
    expect(liveQueryKeysToInvalidate({previous:{version:"1"},next:snapshot("2")})).toEqual(LIVE_QUERY_KEYS);
    expect(liveQueryKeysToInvalidate({previous:{version:"1"},next:{version:"1"}})).toEqual([]);
  });

  it("falls back to every live key for unknown domains or a legacy-only change", () => {
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{billing:"2"})})).toEqual(LIVE_QUERY_KEYS);
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{toString:"2"})})).toEqual(LIVE_QUERY_KEYS);
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2")})).toEqual(LIVE_QUERY_KEYS);
  });

  it("maps exactly the domains bumped by migration 026", () => {
    const sql=readFileSync(resolve(__dirname,"../../migrations/026_live_version_domains.sql"),"utf8");
    const bumped=new Set([...sql.matchAll(/bump_crm_live_domain\(([^)]+)\)/g)].flatMap(match=>match[1].split(",").map(arg=>arg.trim().replace(/'/g,""))));
    expect([...bumped].sort()).toEqual(Object.keys(LIVE_DOMAIN_QUERY_KEYS).sort());
  });
});

describe("liveChangeTime and toClientTime", () => {
  const base={version:"1",domains:{business:"1000.5",work:"900",communication:"800"}};
  it("returns the database time of the newest changed domain", () => {
    expect(liveChangeTime({previous:base,next:{version:"2",domains:{...base.domains,work:"1001.25",communication:"1002"}}})).toBe(1002000);
  });
  it("is unknown without a previous snapshot, without domains or for non-numeric values", () => {
    expect(liveChangeTime({previous:null,next:base})).toBeNull();
    expect(liveChangeTime({previous:{version:"1"},next:base})).toBeNull();
    expect(liveChangeTime({previous:base,next:{version:"2",domains:{...base.domains,work:"abc"}}})).toBeNull();
    expect(liveChangeTime({previous:base,next:base})).toBeNull();
  });
  it("shifts a database time by the offset measured at the request midpoint", () => {
    expect(toClientTime({serverTime:1000000,snapshot:{version:"1",now:"1001"},sentAt:5000000,receivedAt:5000200})).toBe(1000000+5000100-1001000);
    expect(toClientTime({serverTime:1000000,snapshot:{version:"1"},sentAt:0,receivedAt:0})).toBeNull();
  });
  it("requires a load to start after the converted change plus half the round trip and the margin", () => {
    expect(LIVE_FRESH_MARGIN_MS).toBe(1500);
    const changedAt=1000000+5000100-1001000+100;
    expect(liveChangeWindow({serverTime:1000000,snapshot:{version:"1",now:"1001"},sentAt:5000000,receivedAt:5000200})).toEqual({changedAt,freshAfter:changedAt+1500});
    expect(liveChangeWindow({serverTime:1000000,snapshot:{version:"1"},sentAt:0,receivedAt:0})).toBeNull();
  });
  it("treats a load as including a change after the margin or after an own mutation response that followed the change", () => {
    const change={changedAt:10000,freshAfter:11500};
    expect(liveLoadIncludes({startedAt:11501,change,lastOwnMutationAt:undefined})).toBe(true);
    expect(liveLoadIncludes({startedAt:11500,change,lastOwnMutationAt:undefined})).toBe(false);
    expect(liveLoadIncludes({startedAt:10400,change,lastOwnMutationAt:10300})).toBe(true);
    expect(liveLoadIncludes({startedAt:10300,change,lastOwnMutationAt:10300})).toBe(true);
    expect(liveLoadIncludes({startedAt:10200,change,lastOwnMutationAt:10300})).toBe(false);
    expect(liveLoadIncludes({startedAt:10400,change,lastOwnMutationAt:9999})).toBe(false);
    expect(liveLoadIncludes({startedAt:undefined,change,lastOwnMutationAt:10300})).toBe(false);
    expect(liveLoadIncludes({startedAt:99999,change:null,lastOwnMutationAt:10300})).toBe(false);
  });
});
