## ** ELECTRONIC HEALTH RECORD **
** Patient ID: ** {{case_id}}
** Date of record:** {{today}}
---

## ** Patient Information ** 

* **Name** name
* **Age** {{age}}
* **Sex** {{sex}}

---

### **Imaging**  

- **📷 Chest X-ray (From MIDRC):**  
    - {{midrc_xrays}}  
---

### **AI Generated Diagnosis**  
{{xray_annotations}}  

---

### **Analytical Insights**
Plot number of exams taken per day
(Using UDI image generation tools)

{{udi_plot_image}}
---


### **Billing Information**  

**AI Generated Billing Summary:**  
(Using Geneial UMLS mapping tool)
{{billing_codes}}  

---

### **Physician**  

**Dr. Abby Cee, MD**  
Pulmonologist  
License No.: 12345  
Contact: [abc@hospital.com](mailto:abc@hospital.com)  

---
