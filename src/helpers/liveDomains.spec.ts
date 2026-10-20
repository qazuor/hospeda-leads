import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LIVE_DOMAIN_QUERY_KEYS, LIVE_QUERY_KEYS, liveQueryKeysToInvalidate, type LiveSnapshot } from "./liveDomains";

const domains={business:"1",work:"1",communication:"1",catalog:"1",journal:"1"};
const snapshot=(version:string,changes:Record<string,string>={}):LiveSnapshot=>({version,domains:{...domains,...changes}});

describe("liveQueryKeysToInvalidate", () => {
  it("does nothing on the first check or when nothing changed", () => {
    expect(liveQueryKeysToInvalidate({previous:null,next:snapshot("1")})).toEqual([]);
    expect(liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("1")})).toEqual([]);
  });

  it("keeps the business list and stats out of communication-only changes", () => {
    const keys=liveQueryKeysToInvalidate({previous:snapshot("1"),next:snapshot("2",{communication:"2"})});
    expect(keys).toEqual(["communication","resources","data-quality","commercial-detail","settings","lead-journal","global-journal","global-journal-filtered"]);
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
