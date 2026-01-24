import jsPDF from 'jspdf';
import { format } from 'date-fns';

export interface CertificateData {
  traineeName: string;
  clientName: string;
  trainingType: 'training' | 'demo';
  category: 'drone_ops' | 'software_usage' | 'both';
  modelName?: string | null;
  trainingDate?: string | null;
  trainingNumber?: string | null;
  city: string;
}

const getCategoryLabel = (category: string): string => {
  switch (category) {
    case 'drone_ops':
      return 'Drone Operations';
    case 'software_usage':
      return 'Software Usage';
    case 'both':
      return 'Drone Operations & Software Usage';
    default:
      return category;
  }
};

export const generateCertificate = (data: CertificateData): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;

  // Background gradient effect (using rectangles)
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Decorative border
  doc.setDrawColor(59, 130, 246); // Blue
  doc.setLineWidth(2);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  // Inner border
  doc.setDrawColor(147, 197, 253); // Light blue
  doc.setLineWidth(0.5);
  doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Corner decorations
  const cornerSize = 15;
  doc.setFillColor(59, 130, 246);
  
  // Top left corner
  doc.triangle(10, 10, 10 + cornerSize, 10, 10, 10 + cornerSize, 'F');
  // Top right corner
  doc.triangle(pageWidth - 10, 10, pageWidth - 10 - cornerSize, 10, pageWidth - 10, 10 + cornerSize, 'F');
  // Bottom left corner
  doc.triangle(10, pageHeight - 10, 10 + cornerSize, pageHeight - 10, 10, pageHeight - 10 - cornerSize, 'F');
  // Bottom right corner
  doc.triangle(pageWidth - 10, pageHeight - 10, pageWidth - 10 - cornerSize, pageHeight - 10, pageWidth - 10, pageHeight - 10 - cornerSize, 'F');

  // Certificate title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  doc.setTextColor(30, 64, 175); // Dark blue
  doc.text('CERTIFICATE', centerX, 45, { align: 'center' });

  // Subtitle
  doc.setFontSize(18);
  doc.setTextColor(100, 116, 139); // Gray
  doc.text('OF COMPLETION', centerX, 55, { align: 'center' });

  // Decorative line
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(1);
  doc.line(centerX - 60, 62, centerX + 60, 62);

  // "This is to certify that" text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(71, 85, 105);
  doc.text('This is to certify that', centerX, 78, { align: 'center' });

  // Trainee name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(15, 23, 42);
  doc.text(data.traineeName.toUpperCase(), centerX, 95, { align: 'center' });

  // Underline for name
  const nameWidth = doc.getTextWidth(data.traineeName.toUpperCase());
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(centerX - nameWidth / 2 - 10, 98, centerX + nameWidth / 2 + 10, 98);

  // Training completion text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(71, 85, 105);
  doc.text('has successfully completed the', centerX, 112, { align: 'center' });

  // Training type and category
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(30, 64, 175);
  const trainingTitle = `${getCategoryLabel(data.category)} ${data.trainingType === 'training' ? 'Training' : 'Demonstration'}`;
  doc.text(trainingTitle, centerX, 126, { align: 'center' });

  // Model name if available
  if (data.modelName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(71, 85, 105);
    doc.text(`on ${data.modelName}`, centerX, 138, { align: 'center' });
  }

  // Client and location info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  doc.text(`conducted for ${data.clientName} at ${data.city}`, centerX, 150, { align: 'center' });

  // Date
  if (data.trainingDate) {
    const formattedDate = format(new Date(data.trainingDate), 'dd MMMM yyyy');
    doc.text(`Date: ${formattedDate}`, centerX, 162, { align: 'center' });
  }

  // Certificate number
  if (data.trainingNumber) {
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Certificate No: ${data.trainingNumber}`, centerX, 172, { align: 'center' });
  }

  // Signature section
  const sigY = 185;
  
  // Left signature (Trainer)
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(50, sigY, 120, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Authorized Trainer', 85, sigY + 6, { align: 'center' });

  // Right signature (Company)
  doc.line(pageWidth - 120, sigY, pageWidth - 50, sigY);
  doc.text('XBOOM Flow', pageWidth - 85, sigY + 6, { align: 'center' });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('This certificate is digitally generated and valid without signature.', centerX, pageHeight - 18, { align: 'center' });

  // Issue date
  doc.text(`Issued on: ${format(new Date(), 'dd MMM yyyy')}`, centerX, pageHeight - 13, { align: 'center' });

  // Save the PDF
  const fileName = `Certificate_${data.traineeName.replace(/\s+/g, '_')}_${data.trainingNumber || 'cert'}.pdf`;
  doc.save(fileName);
};

export const generateAllCertificates = (
  traineeNames: string[],
  baseData: Omit<CertificateData, 'traineeName'>
): void => {
  traineeNames.forEach((name, index) => {
    setTimeout(() => {
      generateCertificate({
        ...baseData,
        traineeName: name,
      });
    }, index * 500); // Stagger downloads to prevent browser issues
  });
};
