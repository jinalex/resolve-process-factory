// The compiled Dafny evaluator has no types of its own; core/evaluate.ts is the only file that touches it.
declare const compiled: { _dafny: any; Resolve: any; BigNumber: any };
export = compiled;
