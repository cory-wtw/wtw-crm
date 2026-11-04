import { describe, expect, it } from "vitest";
import {
  attachmentUploadDecision,
  findMedicalTerms,
  MEDICAL_TERMS,
  mentionsMedicalTerm,
} from "./medical-terms";

describe("findMedicalTerms", () => {
  it("returns nothing for ordinary file names", () => {
    expect(findMedicalTerms("DD-214.pdf")).toEqual([]);
    expect(findMedicalTerms("drivers-license-front")).toEqual([]);
    expect(findMedicalTerms("")).toEqual([]);
    expect(findMedicalTerms(null)).toEqual([]);
    expect(findMedicalTerms(undefined)).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(findMedicalTerms("PSYCH treatment verification.pdf")).toEqual([
      "psych",
      "treatment",
    ]);
    expect(findMedicalTerms("Disability Summary Letter")).toEqual([
      "disability summary",
    ]);
  });

  it("normalizes separators before matching", () => {
    expect(findMedicalTerms("rating_decision.pdf")).toEqual([
      "rating decision",
    ]);
    expect(findMedicalTerms("Disability-Summary.pdf")).toEqual([
      "disability summary",
    ]);
    expect(findMedicalTerms("diagnosis-2024")).toEqual(["diagnos"]);
  });

  it("matches the C&P exam in its spellings", () => {
    expect(findMedicalTerms("c&p exam notice")).toEqual(["C&P"]);
    expect(findMedicalTerms("C-P-exam.pdf")).toEqual(["C&P"]);
    expect(findMedicalTerms("C and P exam")).toEqual(["C&P"]);
    expect(findMedicalTerms("cp exam")).toEqual(["C&P"]);
    expect(findMedicalTerms("camp photo")).toEqual([]);
  });

  it("uses word boundaries for short terms", () => {
    expect(findMedicalTerms("exclaim.pdf")).toEqual([]);
    expect(findMedicalTerms("MST program flyer")).toEqual(["mst"]);
    expect(findMedicalTerms("almost done")).toEqual([]);
    expect(findMedicalTerms("tbi-screening")).toEqual(["tbi"]);
  });

  it("exempts claim for VSO forms and referral packets", () => {
    expect(
      findMedicalTerms("VSO claim authorization form", "vso_form"),
    ).toEqual([]);
    expect(findMedicalTerms("VSO claim authorization form")).toEqual([]);
    expect(findMedicalTerms("claim intake notes", "referral_packet")).toEqual(
      [],
    );
    expect(findMedicalTerms("claim intake notes", "gov_id")).toEqual(["claim"]);
    expect(findMedicalTerms("claim intake notes")).toEqual(["claim"]);
  });

  it("does not flag non-medical", () => {
    expect(findMedicalTerms("non-medical release")).toEqual([]);
    expect(findMedicalTerms("Non Medical Release.pdf")).toEqual([]);
    expect(findMedicalTerms("medical release")).toEqual(["medical"]);
  });

  it("matches inside prose", () => {
    expect(
      mentionsMedicalTerm("He mentioned his therapy appointment is Tuesday."),
    ).toBe(true);
    expect(
      mentionsMedicalTerm("Needs a ride to the DMV; follow up Friday."),
    ).toBe(false);
  });

  it("every listed term matches itself", () => {
    for (const term of MEDICAL_TERMS) {
      expect(findMedicalTerms(`x ${term} y`)).toContain(term);
    }
  });
});

describe("attachmentUploadDecision", () => {
  it("rejects a flagged name without confirmation", () => {
    const d = attachmentUploadDecision({
      names: ["psych-letter.pdf", "Psych letter"],
      category: "other",
    });
    expect(d.ok).toBe(false);
    expect(d.matchedTerms).toEqual(["psych"]);
  });

  it("allows a flagged name with confirmation and records it", () => {
    const d = attachmentUploadDecision({
      names: ["psych-letter.pdf"],
      category: "other",
      confirmed: true,
    });
    expect(d).toEqual({
      ok: true,
      matchedTerms: ["psych"],
      nonMedicalConfirmed: true,
    });
  });

  it("ignores a confirmation when nothing matched", () => {
    const d = attachmentUploadDecision({
      names: ["dd214.jpg", "DD-214"],
      category: "dd214",
      confirmed: true,
    });
    expect(d).toEqual({
      ok: true,
      matchedTerms: [],
      nonMedicalConfirmed: false,
    });
  });

  it("lets a VSO form mention claim", () => {
    const d = attachmentUploadDecision({
      names: ["claim-form.pdf", "Claim form"],
      category: "vso_form",
    });
    expect(d).toEqual({
      ok: true,
      matchedTerms: [],
      nonMedicalConfirmed: false,
    });
  });
});
