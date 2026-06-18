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
// ...existing code...
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
        let mut weighted_sum_tau = 0.0;
        let mut sum_coh = 0.0;

        for i in 0..self.size - 1 {
            let phi1 = self.coh_pxy_im[i].atan2(self.coh_pxy_re[i]);
            let phi2 = self.coh_pxy_im[i + 1].atan2(self.coh_pxy_re[i + 1]);
            let diff = phi2 - phi1;
            let wrapped_diff = diff.sin().atan2(diff.cos());
            let tau = wrapped_diff / (2.0 * std::f32::consts::PI * delta_f);
            
            self.delay_data[i] = tau;

            let coh = self.coherence_data[i];
            weighted_sum_tau += tau * coh;
            sum_coh += coh;
        }

        if sum_coh > 0.0 {
            weighted_sum_tau / sum_coh
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
