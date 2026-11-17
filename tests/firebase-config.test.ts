import { describe, expect, it } from "vitest";
import { parseFirebaseWebConfig } from "../src/team/auth";

describe("firebase web config", () => {
  it("reads a console firebaseConfig object without eval", () => {
    const parsed = parseFirebaseWebConfig(`
      const firebaseConfig = {
        apiKey: "abc",
        authDomain: "my-project.firebaseapp.com",
        projectId: "my-project",
      };
    `);
    expect(parsed).toEqual({ apiKey: "abc", projectId: "my-project" });
  });

  it("reads a snippet that includes a comment and an import", () => {
    const parsed = parseFirebaseWebConfig(`
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";
      const firebaseConfig = {
        apiKey: "abc",
        projectId: "my-project",
      };
      const app = initializeApp(firebaseConfig);
    `);
    expect(parsed).toEqual({ apiKey: "abc", projectId: "my-project" });
  });

  it("reads JSON and single-quoted keys", () => {
    expect(parseFirebaseWebConfig('{"apiKey":"abc","projectId":"my-project"}')).toEqual({ apiKey: "abc", projectId: "my-project" });
    expect(parseFirebaseWebConfig("{ apiKey: 'abc', projectId: 'my-project', }")).toEqual({ apiKey: "abc", projectId: "my-project" });
  });
});
