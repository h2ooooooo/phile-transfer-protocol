<?php

$finder = PhpCsFixer\Finder::create()
    ->in([__DIR__ . '/ptp-server/src', __DIR__ . '/ptp-server/bin', __DIR__ . '/ptp-server/test', __DIR__ . '/ptp-wordpress'])
    ->exclude(['dist', 'vendor', 'tmp'])
    ->append([__FILE__]);

return (new PhpCsFixer\Config())
    ->setIndent('    ')
    ->setLineEnding("\n")
    ->setCacheFile(__DIR__ . '/ptp-server/tmp/.php-cs-fixer.cache')
    ->setRules([
        '@PSR12' => true,
        'braces_position' => [
            'classes_opening_brace' => 'same_line',
            'functions_opening_brace' => 'same_line',
            'anonymous_functions_opening_brace' => 'same_line',
            'allow_single_line_anonymous_functions' => false,
        ],
        'control_structure_braces' => true,
        'single_quote' => true,
        'whitespace_after_comma_in_array' => true,
        'single_line_throw' => false,
        'concat_space' => ['spacing' => 'one'],
        'binary_operator_spaces' => ['default' => 'single_space'],
        'blank_line_before_statement' => ['statements' => ['return', 'throw', 'if', 'for', 'foreach', 'while', 'try']],
        'no_extra_blank_lines' => true,
        'statement_indentation' => true,
        'no_multiple_statements_per_line' => true,
    ])
    ->setFinder($finder);
