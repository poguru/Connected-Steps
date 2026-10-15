import { whatsappSupportLink } from "@/lib/support-whatsapp";

describe("whatsappSupportLink", () => {
  it("builds a wa.me link with the message encoded", () => {
    expect(whatsappSupportLink("+91 97036 20571", "Hi there")).toBe("https://wa.me/919703620571?text=Hi%20there");
  });

  it("adds the country code to a bare 10-digit number", () => {
    expect(whatsappSupportLink("9703620571", "x")).toBe("https://wa.me/919703620571?text=x");
  });

  it("refuses a missing or malformed number", () => {
    expect(whatsappSupportLink("", "x")).toBeNull();
    expect(whatsappSupportLink(null, "x")).toBeNull();
    expect(whatsappSupportLink("12345", "x")).toBeNull();
  });

  it("refuses the blocked number in any form", () => {
    expect(whatsappSupportLink("+91 97036 20570", "x")).toBeNull();
    expect(whatsappSupportLink("9703620570", "x")).toBeNull();
  });
});
