use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, Fft};
use num_complex::Complex;
use std::sync::Arc;

#[wasm_bindgen]
pub struct WasmFft {
    fft: Arc<dyn Fft<f32>>,
    input_buffer: Vec<Complex<f32>>,
    magnitude_buffer: Vec<f32>,
    phase_buffer: Vec<f32>,
    window_buffer: Vec<f32>,
    size: usize,
}

#[wasm_bindgen]
impl WasmFft {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> WasmFft {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(size);
        
        let mut window_buffer = vec![0.0; size];
        if size > 1 {
            let n_minus_1 = (size - 1) as f32;
            for i in 0..size {
                let n = i as f32;
                // Blackman window: 0.42 - 0.5 * cos(2*pi*n/(N-1)) + 0.08 * cos(4*pi*n/(N-1))
                window_buffer[i] = 0.42 - 0.5 * (2.0 * std::f32::consts::PI * n / n_minus_1).cos() + 0.08 * (4.0 * std::f32::consts::PI * n / n_minus_1).cos();
            }
        }

        WasmFft {
            fft,
            input_buffer: vec![Complex { re: 0.0, im: 0.0 }; size],
            magnitude_buffer: vec![0.0; size],
            phase_buffer: vec![0.0; size],
            window_buffer,
            size,
        }
    }

    /// JS側から入力データ（Float32Array）を渡してセットする
    pub fn set_input(&mut self, input_data: &[f32]) {
        let len = self.size.min(input_data.len());
        for i in 0..len {
            self.input_buffer[i] = Complex { re: input_data[i] * self.window_buffer[i], im: 0.0 };
        }
        // 足りない分は0埋め
        for i in len..self.size {
            self.input_buffer[i] = Complex { re: 0.0, im: 0.0 };
        }
    }

    /// FFTを実行し、振幅と位相を計算する
    pub fn process(&mut self) {
        self.fft.process(&mut self.input_buffer);

        for i in 0..self.size {
            let z = self.input_buffer[i];
            self.magnitude_buffer[i] = z.norm(); // (re*re + im*im).sqrt()
            self.phase_buffer[i] = z.im.atan2(z.re);
        }
    }

    /// マグニチュード（振幅）バッファのポインタを取得
    pub fn magnitude_ptr(&self) -> *const f32 {
        self.magnitude_buffer.as_ptr()
    }

    /// フェーズ（位相）バッファのポインタを取得
    pub fn phase_ptr(&self) -> *const f32 {
        self.phase_buffer.as_ptr()
    }
}
