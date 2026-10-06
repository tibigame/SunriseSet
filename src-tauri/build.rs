fn main() {
    // Windows実行ファイルの埋め込みアイコンも、画像変更時に再生成する。
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
