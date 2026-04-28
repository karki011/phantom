// Author: Subash Karki
package filegraph

import (
	"os"
	"path/filepath"
	"testing"
)

func parseTestFile(t *testing.T, name, content string) *FileNode {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, name)
	os.WriteFile(path, []byte(content), 0644)
	node := ParseFile(path)
	if node == nil {
		t.Fatalf("ParseFile(%s) returned nil", name)
	}
	return node
}

func assertSymbol(t *testing.T, node *FileNode, name, kind string) {
	t.Helper()
	for _, s := range node.Symbols {
		if s.Name == name && s.Kind == kind {
			return
		}
	}
	t.Errorf("expected symbol %s (%s) in %s, got %v", name, kind, node.Path, node.Symbols)
}

func assertImport(t *testing.T, node *FileNode, imp string) {
	t.Helper()
	for _, i := range node.Imports {
		if i == imp {
			return
		}
	}
	t.Errorf("expected import %q in %s, got %v", imp, node.Path, node.Imports)
}

func TestParsePython(t *testing.T) {
	node := parseTestFile(t, "app.py", `
import os
from flask import Flask, jsonify

MAX_RETRIES = 10

class UserService:
    def __init__(self):
        pass

    def get_user(self, user_id):
        pass

def create_app():
    return Flask(__name__)
`)
	if node.Language != "python" {
		t.Errorf("expected python, got %s", node.Language)
	}
	assertImport(t, node, "os")
	assertImport(t, node, "flask")
	assertSymbol(t, node, "UserService", "class")
	assertSymbol(t, node, "create_app", "func")
	assertSymbol(t, node, "MAX_RETRIES", "const")
}

func TestParseRust(t *testing.T) {
	node := parseTestFile(t, "lib.rs", `
use std::collections::HashMap;
extern crate serde;

pub struct Config {
    pub name: String,
}

pub trait Serializable {
    fn serialize(&self) -> Vec<u8>;
}

pub enum Status {
    Active,
    Inactive,
}

pub fn process(input: &str) -> Result<(), Error> {
    Ok(())
}

impl Config {
    pub fn new() -> Self { Config { name: String::new() } }
}

pub const VERSION: &str = "1.0";
pub mod utils;
`)
	assertImport(t, node, "std::collections::HashMap")
	assertImport(t, node, "serde")
	assertSymbol(t, node, "Config", "type")
	assertSymbol(t, node, "Serializable", "interface")
	assertSymbol(t, node, "Status", "type")
	assertSymbol(t, node, "process", "func")
	assertSymbol(t, node, "VERSION", "const")
	assertSymbol(t, node, "utils", "module")
}

func TestParseJava(t *testing.T) {
	node := parseTestFile(t, "App.java", `
import java.util.List;
import static java.lang.Math.PI;

public class Application {
    public static final String VERSION = "1.0";

    public void start() {
    }

    private List<String> getUsers() {
        return null;
    }
}

interface Runnable {
    void run();
}

enum State {
    RUNNING, STOPPED
}
`)
	assertImport(t, node, "java.util.List")
	assertSymbol(t, node, "Application", "class")
	assertSymbol(t, node, "Runnable", "interface")
	assertSymbol(t, node, "State", "type")
}

func TestParseCSharp(t *testing.T) {
	node := parseTestFile(t, "Program.cs", `
using System;
using System.Collections.Generic;

namespace MyApp {
    public class Program {
        public static void Main(string[] args) {
        }
    }

    public interface IService {
        void Execute();
    }

    public struct Point {
        public int X;
    }

    public enum Color {
        Red, Green, Blue
    }
}
`)
	assertImport(t, node, "System")
	assertSymbol(t, node, "Program", "class")
	assertSymbol(t, node, "IService", "interface")
	assertSymbol(t, node, "Point", "type")
	assertSymbol(t, node, "Color", "type")
	assertSymbol(t, node, "MyApp", "module")
}

func TestParseRuby(t *testing.T) {
	node := parseTestFile(t, "app.rb", `
require 'sinatra'
require_relative './models/user'

MAX_SIZE = 100

module Validators
  class EmailValidator
    def validate(email)
    end
  end
end

class Application
  attr_accessor :name

  def initialize
  end

  def start
  end
end

def helper_method
end
`)
	assertImport(t, node, "sinatra")
	assertImport(t, node, "./models/user")
	assertSymbol(t, node, "Validators", "module")
	assertSymbol(t, node, "EmailValidator", "class")
	assertSymbol(t, node, "Application", "class")
	assertSymbol(t, node, "helper_method", "func")
	assertSymbol(t, node, "MAX_SIZE", "const")
}

func TestParseSwift(t *testing.T) {
	node := parseTestFile(t, "App.swift", `
import Foundation
import UIKit

protocol Identifiable {
    var id: String { get }
}

public struct User {
    let name: String
}

class ViewController: UIViewController {
    override func viewDidLoad() {
    }
}

enum AppError {
    case networkError
}

func createApp() -> App {
}
`)
	assertImport(t, node, "Foundation")
	assertImport(t, node, "UIKit")
	assertSymbol(t, node, "Identifiable", "interface")
	assertSymbol(t, node, "User", "type")
	assertSymbol(t, node, "ViewController", "class")
	assertSymbol(t, node, "AppError", "type")
	assertSymbol(t, node, "createApp", "func")
}

func TestParseKotlin(t *testing.T) {
	node := parseTestFile(t, "App.kt", `
import kotlin.collections.List
import io.ktor.server.application.*

data class User(val name: String)

sealed class Result {
    data class Success(val data: Any) : Result()
    data class Error(val message: String) : Result()
}

interface Repository {
    fun findAll(): List<User>
}

object AppConfig {
    const val VERSION = "1.0"
}

fun main() {
}

suspend fun fetchData(): String {
    return ""
}
`)
	assertImport(t, node, "kotlin.collections.List")
	assertSymbol(t, node, "User", "class")
	assertSymbol(t, node, "Result", "class")
	assertSymbol(t, node, "Repository", "interface")
	assertSymbol(t, node, "AppConfig", "type")
	assertSymbol(t, node, "main", "func")
	assertSymbol(t, node, "fetchData", "func")
}

func TestLanguageForExt(t *testing.T) {
	tests := map[string]string{
		".py":    "python",
		".rs":    "rust",
		".java":  "java",
		".cs":    "csharp",
		".c":     "c",
		".cpp":   "cpp",
		".rb":    "ruby",
		".php":   "php",
		".swift": "swift",
		".kt":    "kotlin",
		".scala": "scala",
		".dart":  "dart",
		".lua":   "lua",
		".zig":   "zig",
		".ex":    "elixir",
		".xyz":   "",
	}
	for ext, want := range tests {
		got := LanguageForExt(ext)
		if got != want {
			t.Errorf("LanguageForExt(%q) = %q, want %q", ext, got, want)
		}
	}
}
