import { constraintCases } from "../helpers/constraint-cases";

constraintCases("transaction_proposals", [
  { name: "accepts SALE listed price", changes: { proposalKind: "LISTED_PRICE" } },
  {
    name: "accepts SALE negotiated price",
    changes: { proposalKind: "NEGOTIATED_PRICE", proposedPrice: "1" },
  },
  { name: "accepts maximum decimal price", changes: { proposedPrice: "999999999999999" } },
  {
    name: "rejects decimal overflow",
    changes: { proposedPrice: "1000000000000000" },
    code: "22003",
  },
  { name: "rejects zero price", changes: { proposedPrice: "0" }, constraint: "ck_proposal_kind" },
  {
    name: "rejects negative price",
    changes: { proposedPrice: "-1" },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects missing SALE price",
    changes: { proposedPrice: null },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects SALE rental unit",
    changes: { rentalUnit: "DAY" },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects SALE exchange kind",
    changes: { proposalKind: "EXCHANGE_CONTACT" },
    constraint: "ck_proposal_kind",
  },
  { name: "accepts RENT daily", changes: { type: "RENT", rentalUnit: "DAY" } },
  {
    name: "accepts RENT monthly negotiated price",
    changes: { type: "RENT", proposalKind: "NEGOTIATED_PRICE", rentalUnit: "MONTH" },
  },
  { name: "rejects RENT without unit", changes: { type: "RENT" }, constraint: "ck_proposal_kind" },
  {
    name: "rejects RENT without price",
    changes: { type: "RENT", rentalUnit: "DAY", proposedPrice: null },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects RENT zero price",
    changes: { type: "RENT", rentalUnit: "DAY", proposedPrice: "0" },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects RENT exchange kind",
    changes: { type: "RENT", rentalUnit: "DAY", proposalKind: "EXCHANGE_CONTACT" },
    constraint: "ck_proposal_kind",
  },
  {
    name: "accepts EXCHANGE contact",
    changes: {
      type: "EXCHANGE",
      proposalKind: "EXCHANGE_CONTACT",
      proposedPrice: null,
      listedPriceSnapshot: null,
    },
  },
  {
    name: "rejects EXCHANGE price",
    changes: { type: "EXCHANGE", proposalKind: "EXCHANGE_CONTACT" },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects EXCHANGE rental unit",
    changes: {
      type: "EXCHANGE",
      proposalKind: "EXCHANGE_CONTACT",
      proposedPrice: null,
      rentalUnit: "DAY",
    },
    constraint: "ck_proposal_kind",
  },
  {
    name: "rejects EXCHANGE listed kind",
    changes: { type: "EXCHANGE", proposedPrice: null },
    constraint: "ck_proposal_kind",
  },
  { name: "accepts initial pending cycle", changes: { createdCycle: 1 } },
  {
    name: "rejects zero created cycle",
    changes: { createdCycle: 0 },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects negative created cycle",
    changes: { createdCycle: -1 },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects resolved pending proposal",
    changes: { resolvedAt: new Date() },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects accepted cycle on pending",
    changes: { acceptedCycle: 1 },
    constraint: "ck_proposal_cycles",
  },
  { name: "accepts resolved rejection", changes: { status: "REJECTED", resolvedAt: new Date() } },
  {
    name: "rejects unresolved rejection",
    changes: { status: "REJECTED" },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects accepted cycle on rejection",
    changes: { status: "REJECTED", resolvedAt: new Date(), acceptedCycle: 1 },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "accepts same-cycle acceptance",
    changes: { status: "ACCEPTED", resolvedAt: new Date(), acceptedCycle: 1 },
  },
  {
    name: "accepts later-cycle acceptance",
    changes: { status: "ACCEPTED", resolvedAt: new Date(), acceptedCycle: 2 },
  },
  {
    name: "rejects acceptance before creation cycle",
    changes: { status: "ACCEPTED", resolvedAt: new Date(), createdCycle: 2, acceptedCycle: 1 },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects acceptance without accepted cycle",
    changes: { status: "ACCEPTED", resolvedAt: new Date() },
    constraint: "ck_proposal_cycles",
  },
  {
    name: "rejects acceptance without resolution time",
    changes: { status: "ACCEPTED", acceptedCycle: 1 },
    constraint: "ck_proposal_cycles",
  },
  { name: "rejects invented PAUSED status", changes: { status: "PAUSED" }, code: "22P02" },
]);
