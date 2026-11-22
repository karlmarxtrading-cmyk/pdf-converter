import unittest
from lxml import html
from text_boundaries import html_units, word_gaps


class TextBoundaryRegression(unittest.TestCase):
    def test_inline_markup_and_joined_words(self):
        a = html.fromstring('<p>Hasil <em>akhir</em> dokumen</p>')
        b = html.fromstring('<p>Hasil<em>akhir</em> dokumen</p>')
        self.assertNotEqual(html_units(a), html_units(b))
        self.assertEqual(html_units(a), html_units(html.fromstring('<p>Hasil akhir dokumen</p>')))

    def test_code_indent_and_blank_lines_are_significant(self):
        a = html.fromstring('<pre><code>a\n  b\n\nc</code></pre>')
        for changed in ['a\n b\n\nc', 'a\n  b\nc']:
            self.assertNotEqual(html_units(a), html_units(html.fromstring('<pre>'+changed+'</pre>')))

    def test_physical_line_wrap_and_word_join(self):
        required = word_gaps('satu dua tiga')
        self.assertTrue(required <= word_gaps('satu\ndua tiga'))
        self.assertFalse(required <= word_gaps('sat ud ua tiga'))
        self.assertFalse(required <= word_gaps('satudua tiga'))


if __name__ == '__main__':
    unittest.main()
