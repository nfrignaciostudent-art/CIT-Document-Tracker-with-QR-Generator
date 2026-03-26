import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

class IDEA {

    private int[] subkeys;

    public IDEA(String key) {
        this.subkeys = generateSubkeys(prepareKey(key));
    }

    private long[] prepareKey(String key) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(key.getBytes());
            long[] keyParts = new long[2];
            for (int i = 0; i < 8; i++) {
                keyParts[0] = (keyParts[0] << 8) | (hash[i] & 0xFF);
                keyParts[1] = (keyParts[1] << 8) | (hash[i + 8] & 0xFF);
            }
            return keyParts;
        } catch (Exception e) {
            return new long[]{0L, 0L};
        }
    }

    private int mul(int a, int b) {
        if (a == 0) a = 65536;
        if (b == 0) b = 65536;
        long result = ((long) a * b) % 65537;
        return result == 65536 ? 0 : (int) result;
    }

    private int add(int a, int b) { return (a + b) % 65536; }
    private int xor(int a, int b) { return a ^ b; }

    private int mulInverse(int a) {
        if (a <= 1) return a;
        int t = 0, newT = 1, r = 65537, newR = a;
        while (newR != 0) {
            int q = r / newR;
            int temp = t - q * newT; t = newT; newT = temp;
            temp = r - q * newR; r = newR; newR = temp;
        }
        return t < 0 ? t + 65537 : t;
    }

    private int addInverse(int a) { return (65536 - a) % 65536; }

    private int[] generateSubkeys(long[] keyParts) {
        int[] sk = new int[52];
        int count = 0;
        long hi = keyParts[0], lo = keyParts[1];
        while (count < 52) {
            int[] c = {(int)((hi>>48)&0xFFFF),(int)((hi>>32)&0xFFFF),(int)((hi>>16)&0xFFFF),(int)(hi&0xFFFF),
                       (int)((lo>>48)&0xFFFF),(int)((lo>>32)&0xFFFF),(int)((lo>>16)&0xFFFF),(int)(lo&0xFFFF)};
            for (int i = 0; i < 8 && count < 52; i++) sk[count++] = c[i];
            long nh = (hi<<25)|(lo>>>39), nl = (lo<<25)|(hi>>>39);
            hi = nh & 0xFFFFFFFFFFFFFFFFL; lo = nl & 0xFFFFFFFFFFFFFFFFL;
        }
        return sk;
    }

    private int[] generateDecryptSubkeys() {
        int[] ek = this.subkeys, dk = new int[52];
        dk[48]=mulInverse(ek[48]); dk[49]=addInverse(ek[49]); dk[50]=addInverse(ek[50]); dk[51]=mulInverse(ek[51]);
        for (int i = 7; i >= 0; i--) {
            int be=i*6, bd=(7-i)*6;
            dk[bd]=mulInverse(ek[be]); dk[bd+3]=mulInverse(ek[be+3]);
            if (i==7) { dk[bd+1]=addInverse(ek[be+1]); dk[bd+2]=addInverse(ek[be+2]); }
            else      { dk[bd+1]=addInverse(ek[be+2]); dk[bd+2]=addInverse(ek[be+1]); }
            dk[bd+4]=ek[be+4]; dk[bd+5]=ek[be+5];
        }
        return dk;
    }

    private long encryptBlock(long block, int[] sk) {
        int X1=(int)((block>>48)&0xFFFF), X2=(int)((block>>32)&0xFFFF),
            X3=(int)((block>>16)&0xFFFF), X4=(int)(block&0xFFFF);
        for (int round = 0; round < 8; round++) {
            int b=round*6;
            int s1=mul(X1,sk[b]),s2=add(X2,sk[b+1]),s3=add(X3,sk[b+2]),s4=mul(X4,sk[b+3]);
            int s5=xor(s1,s3),s6=xor(s2,s4);
            int s7=mul(s5,sk[b+4]),s8=add(s6,s7),s9=mul(s8,sk[b+5]),s10=add(s7,s9);
            int s11=xor(s1,s9),s12=xor(s3,s9),s13=xor(s2,s10),s14=xor(s4,s10);
            if (round<7) { X1=s11;X2=s13;X3=s12;X4=s14; }
            else         { X1=s11;X2=s12;X3=s13;X4=s14; }
        }
        int Y1=mul(X1,sk[48]),Y2=add(X2,sk[49]),Y3=add(X3,sk[50]),Y4=mul(X4,sk[51]);
        return ((long)Y1<<48)|((long)Y2<<32)|((long)Y3<<16)|Y4;
    }

    public String encrypt(String plaintext) {
        try {
            byte[] data = plaintext.getBytes("UTF-8");
            int padLen = 8-(data.length%8);
            byte[] padded = new byte[data.length+padLen];
            System.arraycopy(data,0,padded,0,data.length);
            for (int i=data.length;i<padded.length;i++) padded[i]=(byte)padLen;
            StringBuilder r = new StringBuilder();
            for (int i=0;i<padded.length;i+=8) {
                long block=0;
                for (int j=0;j<8;j++) block=(block<<8)|(padded[i+j]&0xFF);
                r.append(String.format("%016X",encryptBlock(block,subkeys)));
            }
            return r.toString();
        } catch (Exception e) { return "Encryption Error"; }
    }

    public String decrypt(String hex) {
        try {
            int[] dk = generateDecryptSubkeys();
            List<Byte> bytes = new ArrayList<>();
            for (int i=0;i<hex.length();i+=16) {
                long block=Long.parseUnsignedLong(hex.substring(i,i+16),16);
                long dec=encryptBlock(block,dk);
                for (int j=7;j>=0;j--) bytes.add((byte)((dec>>(j*8))&0xFF));
            }
            byte[] result=new byte[bytes.size()];
            for (int i=0;i<bytes.size();i++) result[i]=bytes.get(i);
            int padLen=result[result.length-1];
            byte[] unpadded=new byte[result.length-padLen];
            System.arraycopy(result,0,unpadded,0,unpadded.length);
            return new String(unpadded,"UTF-8");
        } catch (Exception e) { return "Decryption Error"; }
    }
}

class QRGenerator {

    public String generate(String docId, String docName, String docType, String submittedBy, String status, String date) {
        // Clean readable text when scanned!!
        String content =
            "=== CIT DOCUMENT ===\n" +
            "ID     : " + docId + "\n" +
            "Name   : " + docName + "\n" +
            "Type   : " + docType + "\n" +
            "By     : " + submittedBy + "\n" +
            "Status : " + status + "\n" +
            "Date   : " + date + "\n" +
            "====================\n" +
            "Group 6 - IDEA Encryption";

        String filename = "QR_" + docId + ".png";
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
            hints.put(EncodeHintType.MARGIN, 2);
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(content, BarcodeFormat.QR_CODE, 350, 350, hints);
            BufferedImage image = new BufferedImage(350, 350, BufferedImage.TYPE_INT_RGB);
            for (int x=0;x<350;x++)
                for (int y=0;y<350;y++)
                    image.setRGB(x, y, matrix.get(x,y) ? 0x000000 : 0xFFFFFF);
            ImageIO.write(image, "PNG", new File(filename));
            return filename;
        } catch (Exception e) {
            return "QR Error: " + e.getMessage();
        }
    }
}

class Document {
    String docId,docName,docType,submittedBy,purpose,dateAdded,status,encryptedData,qrFile;
    List<Map<String,String>> history = new ArrayList<>();

    public Document(String docId,String docName,String docType,String submittedBy,
                    String purpose,String dateAdded,String encryptedData,String qrFile) {
        this.docId=docId; this.docName=docName; this.docType=docType;
        this.submittedBy=submittedBy; this.purpose=purpose; this.dateAdded=dateAdded;
        this.status="Received"; this.encryptedData=encryptedData; this.qrFile=qrFile;
        Map<String,String> init=new HashMap<>();
        init.put("status","Received"); init.put("date",dateAdded);
        init.put("note","Document received and registered");
        history.add(init);
    }
}

class Tracker {
    private IDEA idea = new IDEA("CIT-IDEA-GROUP6-SECRET-KEY-2024");
    private QRGenerator qr = new QRGenerator();
    private List<Document> docs = new ArrayList<>();
    private int counter = 1000;
    private DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static String repeat(String s, int count) {
        if (count <= 0) return "";
        StringBuilder sb = new StringBuilder(s.length() * count);
        for (int i = 0; i < count; i++) sb.append(s);
        return sb.toString();
    }

    public String addDocument(String name,String type,String by,String purpose) {
        counter++;
        String id="CIT-"+counter;
        String date=LocalDateTime.now().format(fmt);
        String data=name+"|"+type+"|"+by+"|"+purpose+"|"+date;

        System.out.println("\n[IDEA ENCRYPTION]");
        System.out.println("Original  : "+data);
        String encrypted=idea.encrypt(data);
        System.out.println("Encrypted : "+encrypted.substring(0,Math.min(32,encrypted.length()))+"...");

        String qrFile=qr.generate(id,name,type,by,"Received",date);
        System.out.println("QR Saved  : "+qrFile);

        docs.add(new Document(id,name,type,by,purpose,date,encrypted,qrFile));
        System.out.println("Document Added!! ID: "+id);
        return id;
    }

    public void updateStatus(String id,String status,String note) {
        Document doc=find(id);
        if (doc==null) { System.out.println("Not found!!"); return; }
        String old=doc.status; doc.status=status;
        doc.qrFile=qr.generate(id,doc.docName,doc.docType,doc.submittedBy,status,doc.dateAdded);
        Map<String,String> h=new HashMap<>();
        h.put("status",status); h.put("date",LocalDateTime.now().format(fmt));
        h.put("note",note.isEmpty()?old+" -> "+status:note);
        doc.history.add(h);
        System.out.println("Status: "+old+" -> "+status+" | QR Updated: "+doc.qrFile);
    }

    public void viewDocument(String id) {
        Document doc=find(id);
        if (doc==null) { System.out.println("Not found!!"); return; }
        System.out.println("\n"+repeat("=", 50));
        System.out.println("ID           : "+doc.docId);
        System.out.println("Name         : "+doc.docName);
        System.out.println("Type         : "+doc.docType);
        System.out.println("Submitted By : "+doc.submittedBy);
        System.out.println("Purpose      : "+doc.purpose);
        System.out.println("Date         : "+doc.dateAdded);
        System.out.println("Status       : "+doc.status);
        System.out.println("\n[IDEA DECRYPTION]");
        System.out.println("Decrypted : "+idea.decrypt(doc.encryptedData));
        System.out.println("\nHISTORY:");
        for (int i=0;i<doc.history.size();i++) {
            Map<String,String> h=doc.history.get(i);
            System.out.println("  "+(i+1)+". ["+h.get("date")+"] "+h.get("status")+" - "+h.get("note"));
        }
        System.out.println("\nQR FILE : "+doc.qrFile);
        System.out.println("(Scan the .png file with your phone!!)");
        System.out.println("(You will see document details when scanned!!)");
    }

    public void viewAll() {
        if (docs.isEmpty()) { System.out.println("No documents!!"); return; }
        System.out.println("\n"+repeat("=", 70));
        System.out.println(String.format("%-12s %-25s %-15s %-15s","ID","Name","Type","Status"));
        System.out.println(repeat("-", 70));
        for (Document d:docs)
            System.out.println(String.format("%-12s %-25s %-15s %-15s",
                d.docId,
                d.docName.length()>24?d.docName.substring(0,24):d.docName,
                d.docType.length()>14?d.docType.substring(0,14):d.docType,
                d.status));
    }

    public void search(String term) {
        List<Document> results=new ArrayList<>();
        for (Document d:docs)
            if (d.docName.toLowerCase().contains(term.toLowerCase())||
                d.submittedBy.toLowerCase().contains(term.toLowerCase())||
                d.docId.toLowerCase().contains(term.toLowerCase())) results.add(d);
        if (results.isEmpty()) { System.out.println("No results for: "+term); return; }
        System.out.println("Found "+results.size()+" result(s):");
        for (Document d:results) System.out.println("  "+d.docId+" | "+d.docName+" | "+d.status);
    }

    public void showQR(String id) {
        Document doc=find(id);
        if (doc==null) { System.out.println("Not found!!"); return; }
        System.out.println("\nQR FILE  : "+doc.qrFile);
        System.out.println("Document : "+doc.docName);
        System.out.println("Status   : "+doc.status);
        try {
            File f=new File(doc.qrFile);
            if (f.exists()) System.out.println("Location : "+f.getAbsolutePath());
        } catch (Exception e) {}
        System.out.println("Scan the .png file!!");
        System.out.println("You will see:");
        System.out.println("  === CIT DOCUMENT ===");
        System.out.println("  ID     : "+doc.docId);
        System.out.println("  Name   : "+doc.docName);
        System.out.println("  Type   : "+doc.docType);
        System.out.println("  By     : "+doc.submittedBy);
        System.out.println("  Status : "+doc.status);
        System.out.println("  ====================");
    }

    public void demo() {
        System.out.println("\n"+repeat("=", 50));
        System.out.println("IDEA ENCRYPTION DEMO");
        System.out.println(repeat("=", 50));
        String msg="FRANCISS";
        System.out.println("Message  : "+msg);
        System.out.println("Block    : 64-bit (8 characters)");
        System.out.println("Key      : 128-bit (52 subkeys)");
        System.out.println("Rounds   : 8 rounds x 14 steps");
        System.out.println("ADD      : mod 65536");
        System.out.println("MULTIPLY : mod 65537");
        System.out.println("XOR      : bitwise");
        String enc=idea.encrypt(msg);
        System.out.println("\nEncrypted: "+enc);
        System.out.println("Decrypted: "+idea.decrypt(enc));
        System.out.println("IDEA Works!!");
    }

    private Document find(String id) {
        for (Document d:docs) if (d.docId.equals(id)) return d;
        return null;
    }
}

public class IDEA_CIT_Document_Tracker {
    private static String readLine(Scanner sc) {
        if (sc == null) return null;
        return sc.hasNextLine() ? sc.nextLine() : null;
    }

    private static String readLineTrim(Scanner sc) {
        String line = readLine(sc);
        return line == null ? null : line.trim();
    }

    private static String repeat(String s, int count) {
        if (count <= 0) return "";
        StringBuilder sb = new StringBuilder(s.length() * count);
        for (int i = 0; i < count; i++) sb.append(s);
        return sb.toString();
    }

    public static void main(String[] args) {
        Scanner sc=new Scanner(System.in);
        Tracker tracker=new Tracker();

        System.out.println(repeat("=", 50));
        System.out.println("  CIT DOCUMENT TRACKER");
        System.out.println("  IDEA Encryption - Group 6");
        System.out.println(repeat("=", 50));

        System.out.println("\n[Loading sample data...]");
        String id1=tracker.addDocument("Enrollment Form","Academic","Juan dela Cruz","2nd Semester Enrollment");
        String id2=tracker.addDocument("Laboratory Request","Laboratory","Maria Santos","Lab Equipment Request");
        String id3=tracker.addDocument("Certificate of Registration","Academic","Pedro Reyes","COR for Scholarship");
        tracker.updateStatus(id1,"Processing","Being reviewed by registrar");
        tracker.updateStatus(id2,"For Approval","Forwarded to department head");
        tracker.updateStatus(id3,"Released","COR released to student");

        while (true) {
            System.out.println("\n"+repeat("=", 50));
            System.out.println("  MAIN MENU");
            System.out.println(repeat("=", 50));
            System.out.println("1. Add Document");
            System.out.println("2. View All Documents");
            System.out.println("3. View Document Details");
            System.out.println("4. Update Status");
            System.out.println("5. Search Document");
            System.out.println("6. Show QR Code");
            System.out.println("7. IDEA Demo");
            System.out.println("8. Exit");
            System.out.print("Choice (1-8): ");

            String choice = readLineTrim(sc);
            if (choice == null) break;
            switch (choice) {
                case "1": {
                    System.out.print("Document Name: ");
                    String name = readLineTrim(sc);
                    if (name == null) return;
                    System.out.print("Document Type: ");
                    String type = readLineTrim(sc);
                    if (type == null) return;
                    System.out.print("Submitted By: ");
                    String by = readLineTrim(sc);
                    if (by == null) return;
                    System.out.print("Purpose: ");
                    String purpose = readLineTrim(sc);
                    if (purpose == null) return;
                    if (!name.isEmpty() && !type.isEmpty() && !by.isEmpty() && !purpose.isEmpty())
                        tracker.addDocument(name, type, by, purpose);
                    else System.out.println("Fill in all fields!!");
                    break;
                }
                case "2": tracker.viewAll(); break;
                case "3": {
                    System.out.print("Document ID: ");
                    String id = readLineTrim(sc);
                    if (id == null) return;
                    tracker.viewDocument(id);
                    break;
                }
                case "4": {
                    System.out.print("Document ID: ");
                    String uid = readLineTrim(sc);
                    if (uid == null) return;
                    System.out.println("Status: Received/Processing/For Approval/Approved/Released/Rejected");
                    System.out.print("New Status: ");
                    String status = readLineTrim(sc);
                    if (status == null) return;
                    System.out.print("Note (optional): ");
                    String note = readLineTrim(sc);
                    if (note == null) return;
                    tracker.updateStatus(uid, status, note);
                    break;
                }
                case "5": {
                    System.out.print("Search: ");
                    String term = readLineTrim(sc);
                    if (term == null) return;
                    tracker.search(term);
                    break;
                }
                case "6": {
                    System.out.print("Document ID: ");
                    String id = readLineTrim(sc);
                    if (id == null) return;
                    tracker.showQR(id);
                    break;
                }
                case "7": tracker.demo(); break;
                case "8":
                    System.out.println("Goodbye!! - Group 6 IDEA Algorithm");
                    sc.close();
                    return;
                default:
                    System.out.println("Invalid choice!!");
            }
        }
    }
}