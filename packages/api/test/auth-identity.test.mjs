import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLoginIdentifier,
  CollegeEmailConfigurationError,
  getCollegeEmailDomains,
  isAllowedCollegeEmail,
  normalizeEmail,
  normalizeIndianPhone,
} from "../src/services/auth-identity.ts";

test("normalizes college emails and Indian phone numbers", () => {
  assert.equal(
    normalizeEmail(" RollNumber@IIITDMJ.AC.IN "),
    "rollnumber@iiitdmj.ac.in",
  );
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeIndianPhone("98765 43210"), "+919876543210");
  assert.equal(normalizeIndianPhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeIndianPhone("1234567890"), null);
});

test("parses and enforces explicit college email domains", () => {
  const domains = getCollegeEmailDomains({
    NODE_ENV: "production",
    COLLEGE_EMAIL_DOMAINS:
      "college.ac.in, @students.college.edu, college.ac.in",
  });
  assert.deepEqual(domains, ["college.ac.in", "students.college.edu"]);
  assert.equal(isAllowedCollegeEmail("user@college.ac.in", domains), true);
  assert.equal(
    isAllowedCollegeEmail("user@students.college.edu", domains),
    true,
  );
  assert.equal(isAllowedCollegeEmail("user@gmail.com", domains), false);
  assert.equal(isAllowedCollegeEmail("user@sub.college.ac.in", domains), false);
});

test("uses the official IIITDMJ domain by default and keeps test isolation", () => {
  assert.deepEqual(getCollegeEmailDomains({ NODE_ENV: "production" }), [
    "iiitdmj.ac.in",
  ]);
  assert.equal(
    isAllowedCollegeEmail(
      "2026abc001@iiitdmj.ac.in",
      getCollegeEmailDomains({ NODE_ENV: "production" }),
    ),
    true,
  );
  assert.deepEqual(getCollegeEmailDomains({ NODE_ENV: "test" }), [
    "campus.edu",
  ]);
  assert.throws(
    () =>
      getCollegeEmailDomains({
        NODE_ENV: "production",
        COLLEGE_EMAIL_DOMAINS: "not a domain",
      }),
    CollegeEmailConfigurationError,
  );
});

test("classifies the shared login identifier without virtual-email mapping", () => {
  assert.deepEqual(classifyLoginIdentifier("2026abc001@iiitdmj.ac.in"), {
    type: "email",
    email: "2026abc001@iiitdmj.ac.in",
  });
  assert.deepEqual(classifyLoginIdentifier("9876543210"), {
    type: "phone",
    phoneNumber: "+919876543210",
  });
  assert.equal(classifyLoginIdentifier("hello"), null);
});
