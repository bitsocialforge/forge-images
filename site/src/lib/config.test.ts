import { describe, expect, it } from "vitest";
import { LOCAL_API_ORIGIN, resolveSiteConfig, TEST_TURNSTILE_SITEKEY, TURNSTILE_SITEKEY } from "./config";

const at = (url: string) => {
  const { hostname, host, protocol } = new URL(url);
  return resolveSiteConfig({ hostname, host, protocol });
};

describe("resolveSiteConfig", () => {
  it("uses the production API and the real Turnstile key on the public site", () => {
    expect(at("https://images.bitsocialforge.com/")).toEqual({
      apiOrigin: "https://img-api.bitsocialforge.com",
      turnstileSitekey: TURNSTILE_SITEKEY,
    });
  });

  it("pairs a portless host with api.<host> and the always-pass test key", () => {
    expect(at("https://forge-images.localhost/report")).toEqual({
      apiOrigin: "https://api.forge-images.localhost",
      turnstileSitekey: TEST_TURNSTILE_SITEKEY,
    });
    expect(at("https://my-branch.forge-images.localhost:8443/").apiOrigin).toBe(
      "https://api.my-branch.forge-images.localhost:8443",
    );
  });

  it.each(["http://localhost:8080/", "http://127.0.0.1:4173/faq", "http://[::1]:4173/"])(
    "talks to the local API with the test key at %s",
    (url) => {
      expect(at(url)).toEqual({ apiOrigin: LOCAL_API_ORIGIN, turnstileSitekey: TEST_TURNSTILE_SITEKEY });
    },
  );
});
