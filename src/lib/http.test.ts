import{describe,it,expect}from "vitest";
import{isSameOrigin}from "./http";
describe("same-origin mutation boundary",()=>{
  const request=(origin:string,host="127.0.0.1:3001")=>new Request("http://localhost:3001/api/pos",{headers:{origin,host}});
  it("accepts the actual browser host despite internal URL normalization",()=>expect(isSameOrigin(request("http://127.0.0.1:3001"))).toBe(true));
  it("rejects cross-origin requests",()=>expect(isSameOrigin(request("https://attacker.example"))).toBe(false));
  it("rejects missing or opaque origins",()=>{expect(isSameOrigin(new Request("http://localhost/api/pos"))).toBe(false);expect(isSameOrigin(request("null"))).toBe(false);});
  it("honors the configured deployment origin and scheme",()=>{expect(isSameOrigin(request("https://shop.example","shop.example"),"https://shop.example")).toBe(true);expect(isSameOrigin(request("http://shop.example","shop.example"),"https://shop.example")).toBe(false);});
});
