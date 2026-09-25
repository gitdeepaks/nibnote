// Deliberate contract violation to prove CI goes red. This branch is deleted after the check.
export const bad: any = JSON.parse("1") as number;
