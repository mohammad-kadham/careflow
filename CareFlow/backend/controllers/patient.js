const { validationResult } = require("express-validator")
const Patients = require("../models/patients")

exports.getPatientById = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const patient = await Patients.getPatientById(Number(req.params.id), req.user.clinic_id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }
        res.status(200).json({ patient });
    } catch (error) {
        next(error);
    }
};

exports.getPatients = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
        const [rows] = await Patients.searchPatients(req.user.clinic_id, req.query.q)
        res.status(200).json({ patients: rows })
    } catch (err) {
        const error = new Error('could not get patients from database');
        error.statusCode = 500;
        next(error)
    }

}



exports.postPatient = async (req, res, next) => {


    try {
        const errors = validationResult(req)



        if (!errors.isEmpty()) {
            const errorMsg=errors.array()[0].msg


            const err = new Error(errorMsg)
            err.statusCode = 400;
            throw err;
        }

        const patient = new Patients(req.body, req.user.clinic_id);
        const [result] = await patient.saveWithMedicalInfo(req.body)
        patient.id = result.insertId;
        res.status(201).json({ message: "patient was created", patient: patient })
    } catch (error) {
        console.log(error);


        if(!error.statusCode){
            error.statusCode = 500;
        }
        next(error)
    }

}

exports.getPatient = async (req, res, next) => {
    const { first_name, last_name } = req.query;

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()){
         throw new Error(errors.array()[0].msg)
        }
        const [rows] = await Patients.getPatientByName(first_name, last_name, req.user.clinic_id);
        res.status(200).json({ patients: rows })
    } catch (error) {

        error.statusCode = 400;
        next(error)
    }

}
