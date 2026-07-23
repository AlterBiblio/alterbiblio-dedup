#!/usr/bin/env python3
import os
import sys
import unittest
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))

from dedup import parse_csv, parse_pubmed_xml


class TestParserCsvMultilinea(unittest.TestCase):
    def test_conserva_campos_multilinea_entrecomillados(self):
        text = ('Title,Abstract,PMID\n'
                '"Title first line\nsecond line","Abstract first line\nsecond line",123\n')
        [record] = parse_csv(text, "CSV")
        self.assertEqual(record["title"], "Title first line\nsecond line")
        self.assertEqual(record["abstract"], "Abstract first line\nsecond line")
        self.assertEqual(record["ntitle"], "title first line second line")
        self.assertEqual(record["nabs"], "abstract first line second line")


class TestParserXmlEstricto(unittest.TestCase):
    def test_rechaza_xml_mal_formado(self):
        malformed = [
            "<PubmedArticleSet><PubmedArticle><PMID>1</PMID></PubmedArticleSet>",
            "<PubmedArticleSet><PubmedArticle><ArticleTitle>A & B</ArticleTitle></PubmedArticle></PubmedArticleSet>",
            '<PubmedArticleSet bad=x></PubmedArticleSet>',
            "<PubmedArticleSet><PubmedArticle></PubmedArticle>",
        ]
        for xml in malformed:
            with self.subTest(xml=xml):
                with self.assertRaises(ET.ParseError):
                    parse_pubmed_xml(xml, "PubMedXML")


if __name__ == "__main__":
    unittest.main()
