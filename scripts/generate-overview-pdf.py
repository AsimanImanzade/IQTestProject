"""
Rəhbərlik üçün ümumi məlumat sənədini (PDF) yaradır.

    python scripts/generate-overview-pdf.py

Qeyd: Azərbaycan əlifbasındakı "ə" (U+0259) hərfi PDF-in standart şrift kodlaşdırmasında
yoxdur. Ona görə sənəddə Unicode dəstəkli TrueType şrift (Calibri) birbaşa fayla yerləşdirilir —
əks halda hərflər səhv görünərdi.
"""

import sys
from pathlib import Path

# Windows konsolu standart olaraq cp1252 kodlaşmasından istifadə edir və "ı" hərfini yaza bilmir.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    ListFlowable,
    ListItem,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# --------------------------------------------------------------------------
# Şrift
# --------------------------------------------------------------------------
FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Calibri", str(FONT_DIR / "calibri.ttf")))
pdfmetrics.registerFont(TTFont("Calibri-Bold", str(FONT_DIR / "calibrib.ttf")))
pdfmetrics.registerFontFamily("Calibri", normal="Calibri", bold="Calibri-Bold")

ACCENT = colors.HexColor("#4E56D3")
INK = colors.HexColor("#1E2229")
MUTED = colors.HexColor("#5A6068")
RULE = colors.HexColor("#DBDEE2")
SOFT = colors.HexColor("#F4F5F9")

styles = getSampleStyleSheet()

TITLE = ParagraphStyle(
    "TitleAz", parent=styles["Title"], fontName="Calibri-Bold",
    fontSize=22, leading=27, textColor=INK, alignment=0, spaceAfter=2,
)
SUBTITLE = ParagraphStyle(
    "SubtitleAz", fontName="Calibri", fontSize=11.5, leading=16,
    textColor=MUTED, spaceAfter=14,
)
H2 = ParagraphStyle(
    "H2Az", fontName="Calibri-Bold", fontSize=13.5, leading=17,
    textColor=ACCENT, spaceBefore=11, spaceAfter=4, keepWithNext=1,
)
BODY = ParagraphStyle(
    "BodyAz", fontName="Calibri", fontSize=10.5, leading=15,
    textColor=INK, alignment=TA_JUSTIFY, spaceAfter=5,
)
BULLET = ParagraphStyle(
    "BulletAz", parent=BODY, alignment=0, spaceAfter=3, leading=15,
)
NOTE = ParagraphStyle(
    "NoteAz", fontName="Calibri", fontSize=10, leading=14.5,
    textColor=INK, alignment=TA_JUSTIFY, leftIndent=8, rightIndent=8,
    spaceBefore=4, spaceAfter=4,
)
SMALL = ParagraphStyle(
    "SmallAz", fontName="Calibri", fontSize=8.5, leading=12, textColor=MUTED,
)


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, BULLET), leftIndent=14, value="circle") for t in items],
        bulletType="bullet", bulletFontName="Calibri", bulletFontSize=8,
        leftIndent=12, spaceAfter=5,
    )


def callout(text):
    """Diqqət çəkilməli mətn üçün fon rəngli qutu."""
    table = Table([[Paragraph(text, NOTE)]], colWidths=[165 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, ACCENT),
    ]))
    return table


def spec_table(rows):
    data = [[Paragraph(f"<b>{k}</b>", BODY), Paragraph(v, BODY)] for k, v in rows]
    table = Table(data, colWidths=[52 * mm, 113 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def decorate_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Calibri", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(22 * mm, 12 * mm, "Koqnitiv Mühakimə Testi — ümumi məlumat")
    canvas.drawRightString(188 * mm, 12 * mm, f"Səhifə {doc.page}")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(22 * mm, 16 * mm, 188 * mm, 16 * mm)
    canvas.restoreState()


def build(output: Path) -> None:
    doc = BaseDocTemplate(
        str(output), pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=18 * mm, bottomMargin=21 * mm,
        title="Koqnitiv Mühakimə Testi — Ümumi Məlumat",
        author="QSS", subject="Sistem haqqında ümumi məlumat",
        lang="az",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="body", frames=[frame], onPage=decorate_page)])

    s = []

    s.append(Paragraph("Koqnitiv Mühakimə Testi", TITLE))
    s.append(Paragraph(
        "Sistem haqqında ümumi məlumat — tez-tez verilən suallar və cavablar", SUBTITLE))

    # 1
    s.append(Paragraph("1. Bu sistem nədir?", H2))
    s.append(Paragraph(
        "Bu, istifadəçinin <b>məntiqi düşünmə qabiliyyətini</b> qiymətləndirən veb tətbiqdir. "
        "Hər istifadəçi 20 sualdan ibarət test cavablandırır və sonda ətraflı nəticə hesabatı "
        "alır: ümumi bal, kateqoriyalar üzrə göstəricilər, güclü və zəif tərəflər, həmçinin "
        "hər sualın izahı.", BODY))
    s.append(Paragraph(
        "Test iki rejimdə keçirilə bilər: <b>vaxt məhdudiyyəti ilə</b> (25 dəqiqə) və "
        "<b>vaxt məhdudiyyətsiz</b>. Test vermək üçün qeydiyyatdan keçmək tələb olunmur. "
        "Testdən əvvəl istifadəçidən <b>yaşı</b> soruşulur — səbəbi 6-cı bölmədə izah olunub.", BODY))

    # 2
    s.append(Paragraph("2. Suallar haradan gəlir?", H2))
    s.append(Paragraph(
        "Suallar <b>əl ilə yazılmır və kənardan alınmır</b> — onları proqramın özü yaradır. "
        "Bu, sistemin ən vacib xüsusiyyətidir və aşağıdakı üstünlükləri verir:", BODY))
    s.append(bullets([
        "<b>Düzgün cavab hesablanır, yazılmır.</b> Hər sual növü üçün proqramda həlledici "
        "alqoritm var. Məsələn, ədəd ardıcıllığının növbəti üzvü qaydanın özü ilə hesablanır, "
        "fırlanmış fiqur isə həqiqi həndəsi çevrilmə ilə alınır. Beləliklə sualın cavabı "
        "prinsipcə səhv ola bilməz.",
        "<b>Hər sual bazaya düşməzdən əvvəl yoxlanılır.</b> Sistem yoxlayır ki, yalnız bir "
        "düzgün cavab var, variantlar bir-birini təkrarlamır, sual iki mənalı deyil və eyni "
        "sual bazada artıq mövcud deyil. Yoxlamadan keçməyən sual atılır.",
        "<b>Şəkillər də proqramla çəkilir.</b> Fiqurlar hazır təsvir faylları deyil — onlar "
        "riyazi olaraq hesablanır və vektor formatında çəkilir. Bu səbəbdən onlar hər ekran "
        "ölçüsündə və həm işıqlı, həm qaranlıq rejimdə düzgün görünür.",
    ]))
    s.append(Paragraph(
        "Hazırda bazada <b>600 sual</b> var. Sistem 10 000-dən çox sualı problemsiz dəstəkləyir — "
        "sualların sayını artırmaq üçün proqram kodunu dəyişmək lazım deyil, yalnız bir parametri "
        "artırmaq kifayətdir.", BODY))

    # 3
    s.append(Paragraph("3. Bütün istifadəçilər eyni testi alır?", H2))
    s.append(Paragraph(
        "<b>Xeyr.</b> Hər test ayrıca yığılır. 600 sualdan 20-si müəyyən qaydalar əsasında "
        "seçilir, sonra həm sualların, həm də cavab variantlarının sırası qarışdırılır.", BODY))
    s.append(callout(
        "İki nəfərin eyni testi alma ehtimalı praktiki olaraq sıfırdır: mümkün kombinasiyaların "
        "sayı 10<super rise=3 size=7>37</super> tərtibindədir. Bundan əlavə, eyni istifadəçi "
        "testi təkrar versə, sistem əvvəlki suallardan qaçır."))

    # 4
    s.append(Paragraph("4. Testin quruluşu necədir?", H2))
    s.append(Paragraph(
        "Hər testin tərkibi sabitdir. Bu, nəticələrin müxtəlif şəxslər arasında müqayisə edilə "
        "bilməsi üçün vacibdir — dəyişən yalnız <i>hansı</i> suallar düşməsidir, testin "
        "<i>çətinliyi</i> deyil.", BODY))
    s.append(spec_table([
        ("Sualların sayı", "20"),
        ("Çətinlik bölgüsü", "4 asan · 8 orta · 6 çətin · 2 çox çətin"),
        ("Kateqoriyalar", "Hər testdə 7 kateqoriya"),
        ("Əsas sahələr",
         "Matris mühakiməsi, ədəd ardıcıllıqları, naxış tanıma, məntiqi mühakimə, "
         "fəza təsəvvürü, analogiyalar — hər biri ən azı 3 sualla təmsil olunur"),
        ("Əlavə sahə",
         "Hər testə növbə ilə bir əlavə kateqoriya daxil edilir (fiqur fırlatma, "
         "təsnifat, artıq olanı tapma, kəmiyyət mühakiməsi və s.)"),
    ]))

    # 5
    s.append(Paragraph("5. Test necə qiymətləndirilir?", H2))
    s.append(Paragraph(
        "Nəticə <b>sadəcə düzgün cavabların sayı deyil</b>. Sistem psixometriyada qəbul edilmiş "
        "<b>Sual-Cavab Nəzəriyyəsi (IRT)</b> modelindən istifadə edir. Praktikada bu o deməkdir:",
        BODY))
    s.append(bullets([
        "<b>Sualın çətinliyi nəzərə alınır.</b> Model bütün cavab mənzərəsini birlikdə "
        "qiymətləndirir, ona görə eyni sayda düzgün cavab fərqli nəticə verə bilər.",
        "<b>Təsadüfi tapma nəzərə alınır.</b> Test çoxvariantlı olduğu üçün heç nə bilməyən "
        "şəxsin də təsadüfən düzgün cavab verə bilməsi hesablamaya daxil edilir. "
        "Çətin suallarda variantların sayı 4 yerinə 5-dir — bu, təsadüfi tapma ehtimalını azaldır.",
        "<b>Cavabsız sual səhv sayılır.</b> Əks halda yalnız asan sualları cavablandıran "
        "şəxsin nəticəsi süni şəkildə yüksək çıxardı.",
        "<b>Cavab sürəti yoxlanılır.</b> Sualları oxumaq belə mümkün olmayan sürətlə "
        "cavablandırma aşkarlanır və belə nəticənin etibarlılığı aşağı kimi qeyd olunur.",
    ]))
    s.append(Paragraph(
        "Nəticə həmişə <b>etibarlılıq intervalı ilə birlikdə</b> göstərilir — məsələn "
        "<b>112 (95% interval: 97–127)</b>. İnterval ölçmənin nə qədər dəqiq olduğunu göstərir "
        "və tək rəqəm qədər vacibdir.", BODY))

    # 6 — yaş
    s.append(Paragraph("6. Nə üçün yaş soruşulur?", H2))
    s.append(Paragraph(
        "Çünki eyni nəticə müxtəlif yaşlarda eyni şeyi bildirmir. Əgər <b>13 yaşlı</b> və "
        "<b>25 yaşlı</b> şəxs eyni sayda düzgün cavab veribsə, bu, onların eyni səviyyədə olması "
        "demək deyil — 13 yaşlı şəxs öz yaş qrupuna görə daha yüksək nəticə göstərmişdir. "
        "Ona görə sistem nəticəni <b>həmyaşıdlarla müqayisə edərək</b> hesablayır. Bu, "
        "beynəlxalq testlərdə (WAIS, Stanford-Binet) istifadə olunan standart yanaşmadır və "
        "\"deviasiya IQ\" adlanır.", BODY))
    s.append(bullets([
        "<b>Qeydiyyatdan keçməmiş istifadəçi</b> hər testdən əvvəl yaşını qeyd edir.",
        "<b>Qeydiyyatdan keçmiş istifadəçi</b> doğum ilini profilində bir dəfə göstərir və hər "
        "testdə həmin gün neçə yaşında olduğu avtomatik yazılır. Beləliklə sonrakı ad günü "
        "əvvəlki nəticəni dəyişmir.",
        "<b>Cins və təhsil səviyyəsi</b> də soruşulur, lakin bunlar <b>bala heç bir təsir "
        "etmir</b> — yalnız hesabat və sualların ədalətliliyinin yoxlanması üçün saxlanılır. "
        "Eyni cavablar həmişə eyni nəticə verir.",
        "Dəstəklənən yaş aralığı: <b>12–100</b>. 12 yaşdan kiçiklər üçün test uyğun deyil, "
        "16 yaşdan kiçiklərə isə əlavə xəbərdarlıq göstərilir (bəzi suallar geniş söz ehtiyatı "
        "tələb edir).",
    ]))
    s.append(callout(
        "<b>Vacib qeyd:</b> yaş üzrə müqayisə <b>modelləşdirilmiş əyri</b> əsasında aparılır — "
        "yəni beynəlxalq tədqiqatlarda təsdiqlənmiş ümumi qanunauyğunluğa əsaslanır, bu testin "
        "öz statistik norma tədqiqatına yox. Ona görə nəticə səhifəsində həmişə <b>hər iki rəqəm</b> "
        "göstərilir: yaşa görə düzəliş edilmiş bal və düzəlişsiz \"xam\" nəticə. Kifayət qədər "
        "real məlumat toplandıqda sistem avtomatik olaraq həqiqi ölçülmüş normalara keçəcək."))

    # 7 — ölkə və peşə müqayisəsi
    s.append(Paragraph("7. Ölkə və peşə üzrə müqayisə", H2))
    s.append(Paragraph(
        "Yalnız <b>qeydiyyatdan keçmiş</b> istifadəçilər üçün. İstifadəçi profilində ölkəsini və "
        "peşəsini qeyd edə bilər. Bundan sonra idarə panelində (dashboard) öz nəticəsinin "
        "<b>ölkəsi və peşəsi üzrə orta göstərici</b> ilə necə fərqləndiyini görür.", BODY))
    s.append(bullets([
        "Bu funksiya <b>yalnız göstərmə məqsədi daşıyır</b> — cins və təhsil kimi, bala heç bir "
        "təsir etmir. Qonaq (guest) rejimində ümumiyyətlə göstərilmir.",
        "Bu orta göstəricilər <b>kənar mənbələrdəndir</b> və başqa testlərdə ölçülüb, ona görə "
        "bizim balla tam eyni şkalada deyil — fərqi təxmini kimi qəbul etmək lazımdır. Ölkə "
        "göstəriciləri International IQ Test (2025) onlayn məlumatlarından, peşə göstəriciləri isə "
        "köhnə və ABŞ əsaslı tədqiqatlardan (Harrell & Harrell, 1945) götürülüb.",
        "Peşələrdə <b>eyni peşə daxilindəki fərq</b> peşələr arasındakı fərqdən daha böyükdür — "
        "yəni bal insanın hansısa sahəyə uyğunluğu haqqında heç nə demir.",
        "Tətbiq heç bir <b>ölkə reytinqi qurmur</b> — yalnız istifadəçinin öz balını öz qrupu ilə "
        "müqayisə edir. Hər göstəricinin yanında mənbəsi və xəbərdarlığı açıq şəkildə yazılır.",
    ]))

    # 8
    s.append(Paragraph("8. Nəticə nəyi göstərir, nəyi göstərmir?", H2))
    s.append(callout(
        "<b>Bu, təxmini qiymətdir.</b> Nəticə <b>bu sual bankı əsasında</b> məntiqi düşünmə "
        "göstəricisini əks etdirir. Bu, <b>klinik və ya rəsmi sertifikatlaşdırılmış IQ testi "
        "deyil</b> — sualların çətinliyi statistik norma tədqiqatı ilə deyil, dizayn yolu ilə "
        "təyin edilib və sistem geniş əhali qrupu üzərində normalaşdırılmayıb."))
    s.append(Paragraph("Nəticədən <b>istifadə etmək olar</b>:", BODY))
    s.append(bullets([
        "Məntiqi düşünmə sahələri üzrə ümumi mənzərəni görmək üçün",
        "Şəxsin öz güclü və zəif tərəflərini müəyyən etməsi üçün",
        "Təlim və inkişaf istiqamətlərini planlaşdırmaq üçün",
    ]))
    s.append(Paragraph("Nəticədən <b>istifadə etmək olmaz</b>:", BODY))
    s.append(bullets([
        "Diaqnoz qoymaq üçün",
        "İşə qəbul, vəzifə təyinatı və ya oxşar rəsmi qərarlar üçün",
        "Rəsmi IQ testlərinin (WAIS, Stanford-Binet və s.) nəticələri ilə müqayisə üçün",
    ]))
    s.append(Paragraph(
        "Bu izahat tətbiqin özündə də — testdən əvvəl və nəticə səhifəsində — açıq şəkildə "
        "göstərilir və gizlədilə bilməz.", BODY))

    # 7
    s.extend([
        Paragraph("9. Kopyalamanın qarşısı necə alınır?", H2),
        bullets([
            "<b>Düzgün cavablar brauzerə göndərilmir.</b> Cavabların yoxlanışı yalnız serverdə "
            "aparılır. İstifadəçi səhifənin kodunu araşdırsa belə, düzgün cavabı görə bilməz.",
            "<b>Cavab verdikdən sonra nəticə bildirilmir.</b> Sistem cavabın düzgün olub-olmadığını "
            "test bitənədək açıqlamır — əks halda variantları bir-bir yoxlamaqla cavabı tapmaq "
            "mümkün olardı.",
            "<b>Vaxt serverdə hesablanır.</b> Ekrandakı sayğac yalnız göstərici xarakter daşıyır; "
            "onu dayandırmaq əlavə vaxt qazandırmır.",
            "<b>Hər testdə suallar və variantlar fərqlidir</b>, ona görə cavabları başqası ilə "
            "bölüşmək faydasızdır.",
            "<b>Səhifədən çıxış qeyd olunur.</b> İstifadəçi başqa tab-a keçsə, bu qeydə alınır və "
            "nəticədə göstərilir. Bu göstərici testi ləğv etmir — yalnız məlumat üçündür.",
            "<b>Eyni anda yalnız bir aktiv test</b> mümkündür.",
        ]),
    ])

    # 8
    s.extend([
        Paragraph("10. Məlumatların təhlükəsizliyi", H2),
        bullets([
            "Şifrələr <b>Argon2id</b> alqoritmi ilə saxlanılır — bu, hazırda tövsiyə edilən "
            "standartdır. Şifrələrin özü heç bir yerdə saxlanılmır.",
            "Sessiyalar serverdə saxlanılır, ona görə istifadəçi çıxış edən kimi giriş məlumatı "
            "dərhal etibarsız olur.",
            "Test vermək üçün şəxsi məlumat tələb olunmur. Qeydiyyat yalnız nəticəni yadda "
            "saxlamaq istəyənlər üçündür.",
            "Sistem sorğu sayına məhdudiyyət qoyur (xüsusilə giriş səhifəsində) və bütün "
            "məlumatlar yoxlanılmadan qəbul edilmir.",
        ]),
    ])

    # 9 — dil dəstəyi
    s.extend([
        Paragraph("11. Dil dəstəyi (İngilis və Azərbaycan)", H2),
        Paragraph(
            "Tətbiq tam ikidillidir — həm <b>interfeys</b>, həm də <b>suallar</b>. Başlıqdakı dil "
            "keçidi həm qonaqlar, həm də qeydiyyatlı istifadəçilər üçün işləyir; seçim qeydiyyatlı "
            "istifadəçinin profilində də saxlanılır.", BODY),
        bullets([
            "<b>Suallar həqiqətən tərcümə olunub</b>, avtomatik çevrilməyib. Sualın mətni, "
            "variantları və izahı hər iki dildə saxlanılır və düzgün cavab hər iki dildə də "
            "quruluşca doğru qalır.",
            "Fiqurlu suallar dildən asılı deyil. Şifahi analogiyalar üçün isə ayrıca, əl ilə "
            "hazırlanmış Azərbaycan söz bazası istifadə olunur.",
            "Test hansı dildə başlanıbsa, nəticəsi və sual təhlili də həmin dildə göstərilir.",
        ]),
        callout(
            "<b>Tövsiyə:</b> ictimai istifadəyə verilməzdən əvvəl Azərbaycan dilindəki sual "
            "məzmununu <b>ana dili daşıyıcısı</b> yoxlamalıdır — mühakimə sualında kiçik "
            "qrammatik səhv sualı iki mənalı edə bilər."),
    ])

    # 10
    s.extend([
        Paragraph("12. Hazırda nə var, növbədə nə var?", H2),
        Paragraph("<b>Hazırdır və işləyir:</b>", BODY),
        bullets([
            "600 sualdan ibarət yoxlanılmış sual bankı (12 kateqoriya)",
            "Testin keçirilməsi (vaxtlı və vaxtsız rejim), sualı işarələmə, yarımçıq testi "
            "davam etdirmə, klaviatura ilə tam idarəetmə",
            "IRT əsasında qiymətləndirmə, yaş qrupu ilə müqayisə və ətraflı nəticə hesabatı",
            "İstifadəçi profili (doğum ili, cins, təhsil, ölkə, peşə) və ölkə/peşə üzrə müqayisə",
            "İstifadəçi kabineti: keçmiş testlər, nəticə tarixçəsi, kateqoriyalar üzrə göstəricilər",
            "Tam ikidilli interfeys və suallar (İngilis / Azərbaycan)",
            "İşıqlı və qaranlıq rejim, mobil və planşet uyğunluğu",
        ]),
        Paragraph("<b>Növbəti mərhələ üçün nəzərdə tutulub:</b>", BODY),
        bullets([
            "Administrator paneli (sualların əl ilə əlavə edilməsi və redaktəsi, CSV ilə "
            "idxal/ixrac, statistika)",
            "PDF sertifikat, çoxdilli interfeys, oflayn rejim, reytinq cədvəli",
        ]),
    ])

    # 10
    # KeepTogether istifadə edilmir: bu blok səhifənin sonuna sığmadıqda tamamilə növbəti səhifəyə
    # keçir və arxada böyük boşluq qalırdı. Cədvəl lazım gələrsə bölünə bilər.
    s.extend([
        Paragraph("13. Qısa texniki məlumat", H2),
        spec_table([
            ("Texnologiyalar", "Next.js 16, React 19, TypeScript, PostgreSQL 16, Prisma 7"),
            ("Yerləşdirmə", "Docker konteyner və ya bulud xidməti (Vercel + Neon/Supabase)"),
            ("Keyfiyyət nəzarəti",
             "199 avtomatik test və uçdan-uca yoxlamalar; hər dəyişiklikdən sonra sual bankı tam yoxlanılır"),
            ("Genişlənmə", "Sual sayı bir parametrlə artırılır (10 000+ dəstəklənir)"),
            ("Əlçatanlıq", "WCAG 2.2 AA standartı nəzərə alınıb"),
        ]),
    ])

    s.append(Spacer(1, 5))
    s.append(Paragraph(
        "Texniki təfərrüatlar üçün layihə sənədləşməsinə baxın: <b>README.md</b>, "
        "<b>docs/psychometrics.md</b> və <b>docs/api.md</b>.", SMALL))

    doc.build(s)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "docs" / "Sistem-Haqqinda-Umumi-Melumat.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    build(out)
    print(f"Yaradıldı: {out}  ({out.stat().st_size / 1024:.0f} KB)")
