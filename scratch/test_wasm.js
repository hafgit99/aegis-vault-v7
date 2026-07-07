const wasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic
  0x01, 0x00, 0x00, 0x00, // version
  
  // 1. Type Section (ID 1)
  0x01, 0x06, 0x01, 
  0x60, 0x02, 0x7f, 0x7f, 0x00, // (i32, i32) -> void (length 6)
  
  // 3. Function Section (ID 3)
  0x03, 0x02, 0x01, 0x00, // function 0 uses type 0 (length 2)
  
  // 5. Memory Section (ID 5)
  0x05, 0x03, 0x01, 0x00, 0x01, // memory 0 with limits (min: 1 page) (length 3)
  
  // 7. Export Section (ID 7)
  0x07, 0x14, 0x02, // (length 20 = 0x14)
  0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, // memory -> "memory"
  0x07, 0x7a, 0x65, 0x72, 0x6f, 0x69, 0x7a, 0x65, 0x00, 0x00, // zeroize -> "zeroize"
  
  // 10. Code Section (ID 10)
  0x0a, 0x2a, 0x01, // section size 42 (0x2a), count 1
  0x28, // body size 40 (0x28)
  0x01, 0x01, 0x7f, // 1 local of type i32
  
  0x41, 0x00, // i32.const 0
  0x21, 0x02, // local.set 2 (i = 0)
  
  0x02, 0x40, // block void
  0x03, 0x40, // loop void
  
  0x20, 0x02, // local.get 2 (i)
  0x20, 0x01, // local.get 1 (len)
  0x4f,       // i32.ge_u
  0x0d, 0x01, // br_if 1 (break to outer block)
  
  0x20, 0x00, // local.get 0 (ptr)
  0x20, 0x02, // local.get 2 (i)
  0x6a,       // i32.add (ptr + i)
  0x41, 0x00, // i32.const 0
  0x3a, 0x00, 0x00, // i32.store8 alignment=0 offset=0
  
  0x20, 0x02, // local.get 2 (i)
  0x41, 0x01, // i32.const 1
  0x6a,       // i32.add
  0x21, 0x02, // local.set 2 (i = i + 1)
  
  0x0c, 0x00, // br 0 (continue loop)
  
  0x0b, // end (loop)
  0x0b, // end (block)
  0x0b, // end (function)
]);

try {
  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {});
  const { memory, zeroize } = instance.exports;
  
  const buffer = new Uint8Array(memory.buffer);
  buffer[10] = 42;
  buffer[11] = 43;
  buffer[12] = 44;
  
  console.log("Before zeroize:", buffer[10], buffer[11], buffer[12]);
  zeroize(10, 3);
  console.log("After zeroize:", buffer[10], buffer[11], buffer[12]);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAILED to compile WASM:", e);
}
