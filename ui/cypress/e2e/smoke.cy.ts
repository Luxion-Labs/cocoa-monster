describe("cocoa.monster", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("renders the brand and the connect-wallet entry point", () => {
    cy.contains("cocoa.monster").should("be.visible");
    cy.get('[data-testid="wallet-connect-button"]').should("exist");
  });

  it("shows an empty markets state on first load", () => {
    cy.window().then((win) => win.localStorage.removeItem("cocoa.knownMarkets"));
    cy.visit("/");
    cy.get('[data-testid="market-list-empty"]').should("be.visible");
  });

  it("navigates to the create-market page", () => {
    cy.contains("New market").click();
    cy.url().should("include", "/create");
  });

  it("renders a market detail page when given an unknown address", () => {
    // No real contract here — Lace isn't installed in the headless run, so
    // this asserts the route at least mounts without crashing the app.
    cy.visit("/m/0xunknown");
    cy.contains("Loading market").should("exist");
  });
});
