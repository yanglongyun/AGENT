mod agent;
mod args;
mod config;
mod llm;
mod model;
mod repository;
mod terminal;
mod tools;

use anyhow::Result;
use clap::Parser;

use crate::agent::Agent;
use crate::args::Args;
use crate::config::{Config, load_dotenv};
use crate::repository::Database;

#[tokio::main]
async fn main() -> Result<()> {
    load_dotenv();
    let args = Args::parse();
    let config = Config::from_args(args)?;
    let database = Database::open(&config.db_path)?;
    let agent = Agent::new(config, database)?;
    terminal::run(agent).await
}
