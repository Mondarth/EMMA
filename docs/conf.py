# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'EMMA - Enhanced Module Manager Application'
copyright = '2026, Ulenar of Mondarth'
author = 'Ulenar of Mondarth'
release = '0.3.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = ['myst_parser', 'sphinx.ext.todo', 'sphinxcontrib.mermaid', 'sphinxcontrib.youtube', 'sphinx_design']

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- MyST (Markdown) configuration -------------------------------------------
# https://myst-parser.readthedocs.io/en/latest/configuration.html

myst_enable_extensions = ['colon_fence', 'deflist', 'substitution']
myst_heading_anchors = 3
myst_substitutions = {
    'LSP': '{abbr}`LSP (Language Server Protocol)`',
    'HMR': '{abbr}`HMR (Hot Module Reload)`',
}



# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'furo'
html_static_path = ['_static']


# -- Ensure TODOs are output (these should all be cleared before a commit)
# https://www.sphinx-doc.org/en/master/usage/extensions/todo.html#directive-todo

todo_include_todos = True
todo_emit_warnings = True
