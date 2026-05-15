/**
 * Backwards-compat shim. compact-runtime 0.16.0 renamed
 * `constructorContext` → `createConstructorContext` and dropped
 * `transactionContext` from CircuitContext (now `currentQueryContext`).
 * The toolchain pinned in nix/compact.nix emits code that requires
 * 0.16.0+, but the midnight-js-* packages we're on (2.x) still import
 * the old names. This module re-exports everything from the new
 * runtime and adds aliases for the old names so midnight-js-* can
 * resolve them.
 *
 * Wired up via `resolve.alias` in vite.config.ts.
 *
 * This file uses an explicit star re-export (which Rollup tracks at
 * build time) plus a manual alias for the renamed entry — the
 * wildcard alone isn't enough because Rollup's static analyzer
 * doesn't traverse `export *` chains across package boundaries.
 */
// Import via the package's own dist path so vite's `@midnight-ntwrk/compact-runtime`
// alias doesn't loop back here. Only this single file should bypass the alias.
// eslint-disable-next-line import/no-relative-packages
import * as ocrt from "../../../node_modules/@midnight-ntwrk/compact-runtime/dist/index.js";

// Re-export every named binding the original module exposes. We can't
// just `export * from` because Rollup's static analyzer follows that
// chain through the package's own d.ts but loses it on indirect names
// like `ContractState` re-exported from `onchain-runtime-v3`. Spreading
// through `ocrt` namespace via dynamic property access keeps everything
// reachable at runtime.
const _re = ocrt as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const constructorContext: any = _re.createConstructorContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createConstructorContext: any = _re.createConstructorContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createCircuitContext: any = _re.createCircuitContext;

export const ContractState = _re.ContractState;
export const QueryContext = _re.QueryContext;
export const StateValue = _re.StateValue;
export const ChargedState = _re.ChargedState;
export const StateMap = _re.StateMap;
export const StateBoundedMerkleTree = _re.StateBoundedMerkleTree;
export const NetworkId = _re.NetworkId;
export const ContractMaintenanceAuthority = _re.ContractMaintenanceAuthority;
export const ContractOperation = _re.ContractOperation;
export const CostModel = _re.CostModel;
export const sampleContractAddress = _re.sampleContractAddress;
export const sampleSigningKey = _re.sampleSigningKey;
export const signatureVerifyingKey = _re.signatureVerifyingKey;
export const verifySignature = _re.verifySignature;
export const signData = _re.signData;
export const dummyContractAddress = _re.dummyContractAddress;
export const emptyZswapLocalState = _re.emptyZswapLocalState;
export const decodeZswapLocalState = _re.decodeZswapLocalState;
export const encodeZswapLocalState = _re.encodeZswapLocalState;
export const encodeContractAddress = _re.encodeContractAddress;
export const decodeContractAddress = _re.decodeContractAddress;
export const encodeCoinPublicKey = _re.encodeCoinPublicKey;
export const decodeCoinPublicKey = _re.decodeCoinPublicKey;
export const encodeRecipient = _re.encodeRecipient;
export const decodeRecipient = _re.decodeRecipient;
export const persistentHash = _re.persistentHash;
export const persistentCommit = _re.persistentCommit;
export const transientHash = _re.transientHash;
export const transientCommit = _re.transientCommit;
export const valueToBigInt = _re.valueToBigInt;
export const bigIntToValue = _re.bigIntToValue;
export const checkRuntimeVersion = _re.checkRuntimeVersion;
export const versionString = _re.versionString;
export const CompactError = _re.CompactError;
export const CompactTypeBytes = _re.CompactTypeBytes;
export const CompactTypeBoolean = _re.CompactTypeBoolean;
export const CompactTypeEnum = _re.CompactTypeEnum;
export const CompactTypeField = _re.CompactTypeField;
export const CompactTypeUnsignedInteger = _re.CompactTypeUnsignedInteger;
export const CompactTypeVector = _re.CompactTypeVector;
export const CompactTypeOpaqueString = _re.CompactTypeOpaqueString;
export const CompactTypeOpaqueUint8Array = _re.CompactTypeOpaqueUint8Array;
export const CompactTypeCurvePoint = _re.CompactTypeCurvePoint;
export const CompactTypeMerkleTreeDigest = _re.CompactTypeMerkleTreeDigest;
export const CompactTypeMerkleTreePath = _re.CompactTypeMerkleTreePath;
export const CompactTypeMerkleTreePathEntry = _re.CompactTypeMerkleTreePathEntry;
export const MAX_FIELD = _re.MAX_FIELD;
export const DUMMY_ADDRESS = _re.DUMMY_ADDRESS;
export const assert = _re.assert;
export const type_error = _re.type_error;
export const ownPublicKey = _re.ownPublicKey;
export const createZswapInput = _re.createZswapInput;
export const createZswapOutput = _re.createZswapOutput;
export const checkProofData = _re.checkProofData;
export const alignedConcat = _re.alignedConcat;
export const tokenType = _re.tokenType;
export const sampleTokenType = _re.sampleTokenType;
export const encodeTokenType = _re.encodeTokenType;
export const decodeTokenType = _re.decodeTokenType;
export const encodeCoinInfo = _re.encodeCoinInfo;
export const decodeCoinInfo = _re.decodeCoinInfo;
export const encodeQualifiedCoinInfo = _re.encodeQualifiedCoinInfo;
export const decodeQualifiedCoinInfo = _re.decodeQualifiedCoinInfo;
export const coinCommitment = _re.coinCommitment;
export const leafHash = _re.leafHash;
export const maxAlignedSize = _re.maxAlignedSize;
export const runProgram = _re.runProgram;
export const ecAdd = _re.ecAdd;
export const ecMul = _re.ecMul;
export const ecMulGenerator = _re.ecMulGenerator;
export const hashToCurve = _re.hashToCurve;
export const degradeToTransient = _re.degradeToTransient;
export const upgradeFromTransient = _re.upgradeFromTransient;
export const convert_bigint_to_Uint8Array = _re.convert_bigint_to_Uint8Array;
export const convert_Uint8Array_to_bigint = _re.convert_Uint8Array_to_bigint;
export const addField = _re.addField;
export const subField = _re.subField;
export const mulField = _re.mulField;
export const queryLedgerState = _re.queryLedgerState;
export const emptyRunningCost = _re.emptyRunningCost;
export const witnessContext = _re.witnessContext;
export const createWitnessContext = _re.createWitnessContext;
export const typeError = _re.typeError;
export const convertFieldToBytes = _re.convertFieldToBytes;
export const contractDependencies = _re.contractDependencies;
