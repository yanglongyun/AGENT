use std::path::PathBuf;

use clap::Parser;

#[derive(Debug, Parser)]
#[command(name = "agent", version, about = "Local CLI agent with shell tools")]
pub struct Args {
    /// OpenAI-compatible chat completions endpoint
    #[arg(long)]
    pub api_url: Option<String>,

    /// API key (prefer LLM_API_KEY)
    #[arg(long)]
    pub api_key: Option<String>,

    /// Model name
    #[arg(long)]
    pub model: Option<String>,

    /// SQLite database path
    #[arg(long)]
    pub db: Option<PathBuf>,

    /// Shell working directory
    #[arg(long)]
    pub cwd: Option<PathBuf>,

    /// Resume an existing chat ID
    #[arg(long)]
    pub resume: Option<String>,

    /// Trigger compaction at this total token count
    #[arg(long)]
    pub compress_threshold: Option<u64>,

    /// Maximum model/tool rounds per user message
    #[arg(long)]
    pub max_rounds: Option<usize>,
}
