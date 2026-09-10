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
    normalizeEmail(" Student@College.AC.IN "),
    "student@college.ac.in",
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

test("college email domains fail closed outside tests", () => {
  assert.throws(
    () => getCollegeEmailDomains({ NODE_ENV: "production" }),
    CollegeEmailConfigurationError,
  );
  assert.deepEqual(getCollegeEmailDomains({ NODE_ENV: "test" }), [
    "campus.edu",
  ]);
});

test("classifies the shared login identifier without virtual-email mapping", () => {
  assert.deepEqual(classifyLoginIdentifier("student@college.ac.in"), {
    type: "email",
    email: "student@college.ac.in",
  });
  assert.deepEqual(classifyLoginIdentifier("9876543210"), {
    type: "phone",
    phoneNumber: "+919876543210",
  });
  assert.equal(classifyLoginIdentifier("hello"), null);
});
