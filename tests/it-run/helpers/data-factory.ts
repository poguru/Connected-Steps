import { ADULT_DOB, CHILD_DOB_AGE_10_EXACT } from "./time";

let _seq = 0;
function seq(): number {
  return ++_seq;
}

/** Generates a unique test email that will never be delivered. */
export function testEmail(label = "p"): string {
  return `itr.test+${label}${Date.now()}${seq()}@connectedsteps.test`;
}

/** Generates a unique 10-digit mobile number (never called). */
export function testMobile(): string {
  const n = (Date.now() % 900_000_000) + 100_000_000;
  return `9${String(n).slice(0, 9)}`;
}

export type ParticipantInput = {
  type: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  email: string;
  mobile: string;
  bloodGroup: string;
  emergencyName: string;
  emergencyPhone: string;
  companyName: string;
  employeeId: string;
  companyIdUrl: string;
  tshirtSize: string;
  medicalConditions: string;
  foodPreference: string;
};

/** Creates a valid adult participant. Override any field as needed. */
export function createAdultParticipant(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    type: "solo",
    firstName: "Test",
    lastName: "Runner",
    gender: "male",
    dob: ADULT_DOB,
    email: testEmail(),
    mobile: testMobile(),
    bloodGroup: "O+",
    emergencyName: "Emergency Contact",
    emergencyPhone: testMobile(),
    companyName: "Test Corp Pvt Ltd",
    employeeId: "EMP-001",
    companyIdUrl: "",
    tshirtSize: "M",
    medicalConditions: "",
    foodPreference: "veg",
    ...overrides,
  };
}

/** Creates a valid child participant (DOB = exactly 10 years old on event date). */
export function createChildParticipant(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    type: "child",
    firstName: "Junior",
    lastName: "Runner",
    gender: "female",
    dob: CHILD_DOB_AGE_10_EXACT,
    email: "",        // children don't require email
    mobile: testMobile(),
    bloodGroup: "A+",
    emergencyName: "",
    emergencyPhone: "",
    companyName: "",
    employeeId: "",
    companyIdUrl: "",
    tshirtSize: "9-10Y",
    medicalConditions: "",
    foodPreference: "veg",
    ...overrides,
  };
}

/** Returns [parent, child] for a kid category registration. */
export function createParentChildParticipants(): [ParticipantInput, ParticipantInput] {
  const parent = createAdultParticipant({ type: "parent" });
  const child  = createChildParticipant({ type: "child" });
  return [parent, child];
}

/** Returns two adult participants for a duo category. */
export function createDuoParticipants(): [ParticipantInput, ParticipantInput] {
  const p1 = createAdultParticipant({ type: "primary" });
  const p2 = createAdultParticipant({ type: "secondary" });
  return [p1, p2];
}

export interface RegistrationPayload {
  categoryId: string;
  couponId: string | null;
  participants: ParticipantInput[];
}

export function registrationPayload(
  categoryId: string,
  participants: ParticipantInput[],
  couponId: string | null = null,
): RegistrationPayload {
  return { categoryId, couponId, participants };
}
