import { groupParticipantsByCategory } from "@/lib/it-run-email-groups";

describe("groupParticipantsByCategory", () => {
  const names = new Map([["cat-solo", "5K Fun Run"], ["cat-kid", "Parent & Child Duo"]]);

  it("gives one group per category, each with only its own runners", () => {
    const groups = groupParticipantsByCategory(
      [{ id: "a", category_id: "cat-kid" }, { id: "b", category_id: "cat-solo" }, { id: "c", category_id: "cat-kid" }],
      "cat-kid", "Parent & Child Duo", names,
    );
    expect(groups.map(g => g.name)).toEqual(["Parent & Child Duo", "5K Fun Run"]);
    expect(groups[0].participants.map(p => p.id)).toEqual(["a", "c"]);
    expect(groups[1].participants.map(p => p.id)).toEqual(["b"]);
  });

  it("counts a runner with no category toward the booking's category", () => {
    const groups = groupParticipantsByCategory([{ id: "a", category_id: null }], "cat-solo", "5K Fun Run", names);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("5K Fun Run");
  });

  it("gives a single group for a single-category booking", () => {
    const groups = groupParticipantsByCategory([{ id: "a", category_id: "cat-solo" }, { id: "b", category_id: null }], "cat-solo", "5K Fun Run", names);
    expect(groups).toHaveLength(1);
    expect(groups[0].participants).toHaveLength(2);
  });
});
