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
    coh_pxx: Vec<f32>,
    coh_pyy: Vec<f32>,
    coh_pxy_re: Vec<f32>,
    coh_pxy_im: Vec<f32>,
    coherence_data: Vec<f32>,
    delay_data: Vec<f32>,
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
            coh_pxx: vec![0.0; size],
            coh_pyy: vec![0.0; size],
            coh_pxy_re: vec![0.0; size],
            coh_pxy_im: vec![0.0; size],
            coherence_data: vec![0.0; size],
            delay_data: vec![0.0; size],
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

    pub fn process_db(&self, alpha: f32, n: f32, output: &mut [f32]) {
        for i in 0..self.size.min(output.len()) {
            let mag = self.magnitude_buffer[i] / n;
            let mag_clamped = if mag < 1e-10 { 1e-10 } else { mag };
            let db = 20.0 * mag_clamped.log10();

            let prev_db = output[i];
            if !prev_db.is_finite() {
                output[i] = db;
            } else {
                output[i] = alpha * prev_db + (1.0 - alpha) * db;
            }
        }
    }

    pub fn smooth_coherence(&self, alpha: f32, output: &mut [f32]) {
        for i in 0..self.size.min(output.len()) {
            let val = self.coherence_data[i];
            if val.is_nan() {
                output[i] = 0.0;
            } else {
                output[i] = output[i] * (1.0 - alpha) + val * alpha;
            }
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

    pub fn coherence_ptr(&self) -> *const f32 {
        self.coherence_data.as_ptr()
    }

    pub fn delay_data_ptr(&self) -> *const f32 {
        self.delay_data.as_ptr()
    }

    pub fn calculate_coherence(&mut self, mic_mag: &[f32], mic_phase: &[f32], ap_mag_ptr: *const f32, ap_phase_ptr: *const f32) {
        let alpha = 0.95;
        let ap_mag = unsafe { std::slice::from_raw_parts(ap_mag_ptr, self.size) };
        let ap_phase = unsafe { std::slice::from_raw_parts(ap_phase_ptr, self.size) };

        for i in 0..self.size {
            if i >= mic_mag.len() || i >= mic_phase.len() || i >= ap_mag.len() || i >= ap_phase.len() {
                break;
            }

            let mx = mic_mag[i];
            let my = ap_mag[i];
            let px = mic_phase[i];
            let py = ap_phase[i];

            let pxx = mx * mx;
            let pyy = my * my;
            let phase_diff = px - py;
            let cross = mx * my;
            let c_re = cross * phase_diff.cos();
            let c_im = cross * phase_diff.sin();

            self.coh_pxx[i] = alpha * self.coh_pxx[i] + (1.0 - alpha) * pxx;
            self.coh_pyy[i] = alpha * self.coh_pyy[i] + (1.0 - alpha) * pyy;
            self.coh_pxy_re[i] = alpha * self.coh_pxy_re[i] + (1.0 - alpha) * c_re;
            self.coh_pxy_im[i] = alpha * self.coh_pxy_im[i] + (1.0 - alpha) * c_im;

            let cross_power_mag_sq = self.coh_pxy_re[i].powi(2) + self.coh_pxy_im[i].powi(2);
            let auto_power_prod = self.coh_pxx[i] * self.coh_pyy[i];

            self.coherence_data[i] = if auto_power_prod > 1e-30 {
                cross_power_mag_sq / auto_power_prod
            } else {
                0.0
            };
        }
    }

    pub fn calculate_delay(&mut self, sample_rate: f32) -> f32 {
        let delta_f = sample_rate / self.size as f32;
        let half_size = self.size / 2;
        let mut sum_w = 0.0;
        let mut sum_w_f = 0.0;
        let mut sum_w_phi = 0.0;
        let mut sum_w_ff = 0.0;
        let mut sum_w_fphi = 0.0;

        let mut prev_raw_phase: Option<f32> = None;
        let mut unwrapped_phase = 0.0;

        for i in 1..half_size {
            let raw_phase = self.coh_pxy_im[i].atan2(self.coh_pxy_re[i]);
            if let Some(prev_phase) = prev_raw_phase {
                let phase_step = raw_phase - prev_phase;
                let wrapped_step = phase_step.sin().atan2(phase_step.cos());
                unwrapped_phase += wrapped_step;
            } else {
                unwrapped_phase = raw_phase;
            }
            prev_raw_phase = Some(raw_phase);

            let coh = self.coherence_data[i].clamp(0.0, 1.0);
            let power = ((self.coh_pxx[i] + self.coh_pyy[i]) * 0.5).max(1e-30);
            let weight = coh * power;
            if weight <= 1e-20 {
                self.delay_data[i] = 0.0;
                continue;
            }

            let freq = i as f32 * delta_f;
            self.delay_data[i] = -unwrapped_phase / (2.0 * std::f32::consts::PI * freq.max(1e-12));

            sum_w += weight;
            sum_w_f += weight * freq;
            sum_w_phi += weight * unwrapped_phase;
            sum_w_ff += weight * freq * freq;
            sum_w_fphi += weight * freq * unwrapped_phase;
        }

        let denom = sum_w * sum_w_ff - sum_w_f * sum_w_f;
        if sum_w > 0.0 && denom.abs() > 1e-20 {
            let slope = (sum_w * sum_w_fphi - sum_w_f * sum_w_phi) / denom;
            -slope / (2.0 * std::f32::consts::PI)
        } else {
            0.0
        }
    }

    pub fn calculate_lufs(&self, freq_data_db: &[f32], hz_per_bin: f32) -> f32 {
        let mut lufs_power = 0.0;
        for i in 1..freq_data_db.len() {
            let f = i as f32 * hz_per_bin;
            let v_db = freq_data_db[i];

            let weight_db = if f < 50.0 {
                -60.0
            } else if f < 100.0 {
                -60.0 + ((f - 50.0) / 50.0) * 60.0
            } else if f > 2000.0 {
                4.0
            } else {
                ((f - 100.0) / 1900.0) * 4.0
            };

            lufs_power += 10.0f32.powf((v_db + weight_db) / 10.0);
        }

        let avg_power = lufs_power / (freq_data_db.len() as f32 - 1.0).max(1.0);
        if avg_power > 0.0 {
            10.0 * avg_power.log10() - 0.691
        } else {
            f32::NEG_INFINITY
        }
    }
}
